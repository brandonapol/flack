import { describe, expect, it } from 'vitest'

import { log } from '../../../git/repo'
import { appendLine, remoteCommit } from '../../../git/sync'
import { DOCS_URL, inRepo, session, type Session } from './harness'

const SLUG = 'inkwell/docs-site'

function edit(s: Session, path: string, content: string): Session {
  const local = s.state.git.local!
  s.state = {
    ...s.state,
    git: { ...s.state.git, local: { ...local, working: { ...local.working, [path]: content } } },
  }
  return s
}

/** Ada commits her name at the bottom of team.md. */
function commitAda(s: Session): Session {
  edit(s, 'team.md', `${s.state.git.local!.working['team.md']}- Ada\n`)
  return s.run('git commit -am "Add Ada"')
}

/** Sam pushes a line to `path` on GitNub. On README.md it doesn't touch Ada's lines. */
function samPushes(s: Session, path = 'README.md'): Session {
  const result = remoteCommit(s.state.git.remotes[SLUG], {
    author: { name: 'Sam Rivera', email: 'sam@inkwell.example' },
    message: 'Add Sam',
    change: appendLine(path, '- Sam Rivera'),
    timestamp: s.state.clock - 60,
  })
  s.state = {
    ...s.state,
    git: { ...s.state.git, remotes: { ...s.state.git.remotes, [SLUG]: result.remote } },
  }
  return s
}

const diverged = (path?: string) => samPushes(commitAda(inRepo()), path)
const local = (s: Session) => s.state.git.local!
const head = (s: Session) => local(s).commits[local(s).branches[local(s).head]]
const remoteMain = (s: Session) => s.state.git.remotes[SLUG].branches.main

describe('a diverged branch', () => {
  it('git status says so after a fetch', () => {
    const s = diverged().run('git fetch', 'git status')
    expect(s.lastText).toContain(
      "Your branch and 'origin/main' have diverged,\nand have 1 and 1 different commits each, respectively."
    )
  })

  it('git pull with nothing configured prints Git’s hint and changes nothing', () => {
    const s = diverged()
    const before = head(s).id
    s.run('git pull')
    expect(s.lastText).toContain(
      'hint: You have divergent branches and need to specify how to reconcile them.'
    )
    expect(s.lastText).toContain('fatal: Need to specify how to reconcile divergent branches.')
    expect(s.lastText).toContain('git pull --rebase')
    expect(head(s).id).toBe(before)
    expect(s.ok).toBe(false)
  })
})

describe('git pull --no-rebase', () => {
  it('makes a merge commit, then pushes', () => {
    const s = diverged()
    const mine = head(s).id
    s.run('git pull --no-rebase')
    expect(s.lastText).toContain("Merge made by the 'ort' strategy.")
    expect(s.lastText).toContain(':wq')
    expect(s.lastText).toContain(' README.md | 1 +')
    expect(head(s).parents).toEqual([mine, remoteMain(s)])
    expect(head(s).message).toBe("Merge branch 'main' of https://gitnub.com/inkwell/docs-site")
    expect(local(s).working['README.md']).toContain('- Sam Rivera')
    expect(local(s).working['team.md']).toContain('- Ada')

    s.run('git log --oneline')
    expect(s.lastText.split('\n')[0]).toContain(
      "Merge branch 'main' of https://gitnub.com/inkwell/docs-site"
    )
    s.run('git push')
    expect(s.ok).toBe(true)
    expect(remoteMain(s)).toBe(head(s).id)
  })

  it('reports a conflict and leaves the branch alone', () => {
    const s = diverged('team.md')
    const before = head(s).id
    s.run('git pull --no-rebase')
    expect(s.lastText).toContain('Auto-merging team.md')
    expect(s.lastText).toContain('CONFLICT (content): Merge conflict in team.md')
    expect(s.lastText).toContain(
      'Automatic merge failed; fix conflicts and then commit the result.'
    )
    expect(head(s).id).toBe(before)
    expect(local(s).working['team.md']).not.toContain('<<<<<<<')
    // The fetch still happened.
    expect(local(s).remoteBranches.main).toBe(remoteMain(s))
    expect(s.ok).toBe(false)
  })
})

describe('git pull --rebase', () => {
  it('puts our commit on top with a new id, in a straight line, then pushes', () => {
    const s = diverged()
    const mine = head(s)
    s.run('git pull --rebase')
    expect(s.lastText).toContain('Successfully rebased and updated refs/heads/main.')
    expect(head(s).id).not.toBe(mine.id)
    expect(head(s).message).toBe(mine.message)
    expect(head(s).parents).toEqual([remoteMain(s)])
    const history = log(local(s).commits, head(s).id)
    expect(history.every((commit) => commit.parents.length <= 1)).toBe(true)

    s.run('git push')
    expect(s.ok).toBe(true)
    expect(remoteMain(s)).toBe(head(s).id)
  })

  it('needs a clean working tree', () => {
    const s = edit(diverged(), 'README.md', 'draft\n').run('git pull --rebase')
    expect(s.lastText).toContain('error: cannot pull with rebase: You have unstaged changes.')
    expect(s.ok).toBe(false)
  })
})

describe('pull.rebase and pull.ff', () => {
  it('pull.rebase true rebases, false merges', () => {
    const rebased = diverged().run('git config pull.rebase true', 'git pull')
    expect(rebased.lastText).toContain('Successfully rebased')

    const merged = diverged().run('git config --global pull.rebase false', 'git pull')
    expect(merged.lastText).toContain("Merge made by the 'ort' strategy.")
    expect(merged.run('git config pull.rebase').lastText).toBe('false')
  })

  it('a flag beats the config', () => {
    const s = diverged().run('git config pull.rebase true', 'git pull --no-rebase')
    expect(s.lastText).toContain("Merge made by the 'ort' strategy.")
  })

  it('pull.ff only refuses to reconcile', () => {
    const s = diverged().run('git config pull.ff only', 'git pull')
    expect(s.lastText).toContain("hint: Diverging branches can't be fast-forwarded")
    expect(s.lastText).toContain('fatal: Not possible to fast-forward, aborting.')
    expect(s.run('git config --list').lastText).toContain('pull.ff=only')
  })

  it('rejects a value Flack doesn’t know', () => {
    const s = inRepo().run('git config pull.rebase sometimes')
    expect(s.lastText).toContain("fatal: bad boolean config value 'sometimes' for 'pull.rebase'")
    expect(s.state.git.config.pullRebase).toBeUndefined()
  })
})

describe('git merge', () => {
  it('merges origin/main after a fetch', () => {
    const s = diverged().run('git fetch', 'git merge origin/main')
    expect(s.lastText).toContain("Merge made by the 'ort' strategy.")
    expect(head(s).message).toBe("Merge remote-tracking branch 'origin/main'")
    expect(head(s).parents).toHaveLength(2)
  })

  it('fast-forwards when we have nothing new, and says when there is nothing to do', () => {
    const s = samPushes(inRepo()).run('git fetch', 'git merge origin/main')
    expect(s.lastText).toMatch(/^Updating \w{7}\.\.\w{7}\nFast-forward\n README.md \| 1 \+/)
    expect(s.run('git merge origin/main').lastText).toBe('Already up to date.')
  })

  it('merges the upstream when no branch is named', () => {
    const s = diverged().run('git fetch', 'git merge')
    expect(head(s).message).toBe("Merge remote-tracking branch 'origin/main'")
  })

  it('names a local branch in the message', () => {
    const s = inRepo().run('git switch -c side')
    commitAda(s).run('git switch main')
    edit(s, 'README.md', '# Docs\n').run('git commit -am "Retitle"', 'git merge side')
    expect(head(s).message).toBe("Merge branch 'side'")
  })

  it('refuses when an edit would be overwritten', () => {
    const s = edit(diverged().run('git fetch'), 'README.md', 'draft\n').run('git merge origin/main')
    expect(s.lastText).toContain(
      'error: Your local changes to the following files would be overwritten by merge:\n\tREADME.md'
    )
    expect(s.ok).toBe(false)
  })

  it('explains an unknown ref and --abort', () => {
    expect(inRepo().run('git merge nope').lastText).toBe('merge: nope - not something we can merge')
    expect(inRepo().run('git merge --abort').lastText).toContain(
      'fatal: There is no merge to abort (MERGE_HEAD missing).'
    )
  })
})

describe('git rebase', () => {
  it('rebases onto origin/main after a fetch', () => {
    const s = diverged().run('git fetch', 'git rebase origin/main')
    expect(s.lastText).toBe('Successfully rebased and updated refs/heads/main.')
    expect(head(s).parents).toEqual([remoteMain(s)])
    s.run('git status')
    expect(s.lastText).toContain("Your branch is ahead of 'origin/main' by 1 commit.")
  })

  it('is up to date when there is nothing to replay onto', () => {
    expect(inRepo().run('git rebase origin/main').lastText).toBe(
      'Current branch main is up to date.'
    )
  })

  it('refuses with staged or unstaged changes', () => {
    const s = edit(diverged().run('git fetch'), 'README.md', 'draft\n').run('git rebase')
    expect(s.lastText).toBe(
      'error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.'
    )
    s.run('git add README.md', 'git rebase')
    expect(s.lastText).toBe(
      'error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.'
    )
  })

  it('stops on a conflict without changing anything', () => {
    const s = diverged('team.md').run('git fetch')
    const before = head(s).id
    s.run('git rebase')
    expect(s.lastText).toContain('CONFLICT (content): Merge conflict in team.md')
    expect(s.lastText).toMatch(/error: could not apply \w{7}\.\.\. Add Ada/)
    expect(head(s).id).toBe(before)
  })

  it('points interactive rebase at the Commit Lab', () => {
    expect(inRepo().run('git rebase -i HEAD~2').lastText).toContain('Commit Lab')
  })

  it('explains an unknown upstream', () => {
    expect(inRepo().run('git rebase nope').lastText).toBe("fatal: invalid upstream 'nope'")
  })
})

describe('git help', () => {
  it('lists merge and rebase', () => {
    const text = inRepo().run('git').lastText
    expect(text).toContain('   merge      Join two or more development histories together')
    expect(text).toContain('   rebase     Reapply commits on top of another base tip')
  })
})

describe('git merge without an identity', () => {
  it('fast-forwards anyway, but needs one for a merge commit', () => {
    const ff = samPushes(session().run(`git clone ${DOCS_URL}`, 'cd docs-site'))
    ff.run('git fetch', 'git merge origin/main')
    expect(ff.lastText).toContain('Fast-forward')

    const s = diverged().run('git fetch')
    s.state = { ...s.state, git: { ...s.state.git, config: {} } }
    const before = head(s).id
    s.run('git merge origin/main')
    expect(s.lastText).toContain('Author identity unknown')
    expect(head(s).id).toBe(before)
  })
})
