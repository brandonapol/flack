import { describe, expect, it } from 'vitest'

import { shortId } from '../../../git/hash'
import { inRepo, session, DOCS_URL } from './harness'

function withEdit(s: ReturnType<typeof inRepo>, path: string, content: string) {
  const local = s.state.git.local!
  s.state = {
    ...s.state,
    git: { ...s.state.git, local: { ...local, working: { ...local.working, [path]: content } } },
  }
  return s
}

const appendAda = (s: ReturnType<typeof inRepo>) =>
  withEdit(s, 'team.md', `${s.state.git.local!.working['team.md']}- Ada Lovelace\n`)

describe('git status', () => {
  it('long and short formats', () => {
    const s = inRepo().run('git status')
    expect(s.lastText).toBe(
      "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean"
    )
    appendAda(s).run('git status')
    expect(s.lastText).toContain('\tmodified:   team.md')
    expect(s.last.find((l) => l.text.includes('modified:'))?.tone).toBe('unstaged')
    expect(s.run('git status -s').lastText).toBe(' M team.md')
  })
})

describe('git add', () => {
  it('stages a file, "." and -A', () => {
    const s = appendAda(inRepo()).run('git add team.md', 'git status')
    expect(s.lastText).toContain('Changes to be committed:')
    expect(s.last.find((l) => l.text.includes('modified:'))?.tone).toBe('staged')
    expect(appendAda(inRepo()).run('git add .', 'git status -s').lastText).toBe('M  team.md')
    expect(appendAda(inRepo()).run('git add -A', 'git status -s').lastText).toBe('M  team.md')
  })

  it('resolves paths from a subfolder', () => {
    const s = withEdit(inRepo(), 'docs/welcome.md', 'hi\n').run(
      'cd docs',
      'git add welcome.md',
      'git status -s'
    )
    expect(s.lastText).toBe('M  docs/welcome.md')
    const t = withEdit(appendAda(inRepo()), 'docs/welcome.md', 'hi\n').run(
      'cd docs',
      'git add .',
      'git status -s'
    )
    expect(t.lastText).toBe('M  docs/welcome.md\n M team.md')
  })

  it('errors on unknown paths and on nothing specified', () => {
    const s = inRepo().run('git add nope.md')
    expect(s.lastText).toBe("fatal: pathspec 'nope.md' did not match any files")
    expect(s.ok).toBe(false)
    expect(s.run('git add').lastText).toContain("Maybe you wanted to say 'git add .'?")
  })
})

describe('git restore', () => {
  it('discards an edit, or unstages with --staged', () => {
    const s = appendAda(inRepo()).run(
      'git add team.md',
      'git restore --staged team.md',
      'git status -s'
    )
    expect(s.lastText).toBe(' M team.md')
    s.run('git restore team.md', 'git status -s')
    expect(s.lastText).toBe('')
    expect(s.state.git.local!.working['team.md']).not.toContain('Ada')
  })

  it('errors on unknown paths and missing paths', () => {
    expect(inRepo().run('git restore nope.md').lastText).toBe(
      "error: pathspec 'nope.md' did not match any file(s) known to git"
    )
    expect(inRepo().run('git restore').lastText).toBe('fatal: you must specify path(s) to restore')
  })
})

describe('git diff', () => {
  it('shows unstaged changes, or staged ones with --staged', () => {
    const s = appendAda(inRepo()).run('git diff')
    expect(s.lastText).toContain('+- Ada Lovelace')
    expect(s.last.find((l) => l.text === '+- Ada Lovelace')?.tone).toBe('success')
    expect(s.run('git diff --staged').lastText).toBe('')
    s.run('git add team.md')
    expect(s.run('git diff').lastText).toBe('')
    expect(s.run('git diff --cached').lastText).toContain('+- Ada Lovelace')
  })

  it('limits to a path, and rejects unknown ones', () => {
    const s = withEdit(appendAda(inRepo()), 'README.md', 'x\n')
    expect(s.run('git diff team.md').lastText).not.toContain('README')
    expect(s.run('git diff nope').lastText).toContain("fatal: ambiguous argument 'nope'")
  })
})

describe('git commit', () => {
  it('commits staged changes with Git’s summary', () => {
    const s = appendAda(inRepo()).run(
      'git add team.md',
      'git commit -m "Add Ada Lovelace to team list"'
    )
    const tip = s.state.git.local!.branches.main
    expect(s.lastText).toBe(
      `[main ${shortId(tip)}] Add Ada Lovelace to team list\n 1 file changed, 1 insertion(+)`
    )
    expect(s.state.git.local!.commits[tip].author).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@inkwell.example',
    })
    expect(s.run('git status').lastText).toContain(
      "Your branch is ahead of 'origin/main' by 1 commit."
    )
  })

  it('-am stages tracked changes first; several -m become paragraphs', () => {
    const s = appendAda(inRepo()).run('git commit -am "Add Ada" -m "Hello team"')
    expect(s.ok).toBe(true)
    const tip = s.state.git.local!.branches.main
    expect(s.state.git.local!.commits[tip].message).toBe('Add Ada\n\nHello team')
  })

  it('without -m explains instead of opening an editor', () => {
    const s = appendAda(inRepo()).run('git add .', 'git commit')
    expect(s.lastText).toContain('Real Git would open a text editor here')
    expect(s.lastText).toContain('git commit -m "Describe your change"')
    expect(s.ok).toBe(false)
  })

  it('nothing staged prints Git’s status-style refusal', () => {
    expect(inRepo().run('git commit -m "x"').lastText).toContain(
      'nothing to commit, working tree clean'
    )
    expect(appendAda(inRepo()).run('git commit -m "x"').lastText).toContain(
      'no changes added to commit (use "git add" and/or "git commit -a")'
    )
  })

  it('missing identity prints the exact Author identity unknown block', () => {
    const s = appendAda(
      session().run(`git clone ${DOCS_URL}`, 'cd docs-site') as ReturnType<typeof inRepo>
    ).run('git add .', 'git commit -m "Add Ada"')
    expect(s.lastText).toMatch(/^Author identity unknown\n\n\*\*\* Please tell me who you are\./)
    expect(s.lastText).toContain('  git config --global user.email "you@example.com"')
    expect(s.ok).toBe(false)
  })

  it('handles a missing -m value', () => {
    expect(inRepo().run('git commit -m').lastText).toBe("error: switch `m' requires a value")
    expect(appendAda(inRepo()).run('git add .', 'git commit Add Ada').lastText).toContain(
      'Did you forget the -m?'
    )
  })
})

describe('git commit --amend', () => {
  it('rewrites the last commit’s message, keeping its parent and its changes', () => {
    const s = appendAda(inRepo()).run('git switch -c ada', 'git commit -am "Add Ad"')
    const before = s.state.git.local!
    const typo = before.commits[before.branches.ada]
    s.run('git commit --amend -m "Add Ada"')
    const after = s.state.git.local!
    const fixed = after.commits[after.branches.ada]
    expect(fixed.id).not.toBe(typo.id)
    expect(fixed.message).toBe('Add Ada')
    expect(fixed.parents).toEqual(typo.parents)
    expect(fixed.tree).toEqual(typo.tree)
    expect(s.lastText).toMatch(/^\[ada [0-9a-f]{7}\] Add Ada\n 1 file changed, 1 insertion\(\+\)$/)
    // Replaced, not added to: the old commit is no longer in the branch's history.
    const history = s.run('git log --oneline').lastText
    expect(history).toMatch(/ Add Ada$/m)
    expect(history).not.toMatch(/ Add Ad$/m)
  })

  it('adds a forgotten change to the last commit with --no-edit', () => {
    const s = appendAda(inRepo()).run('git switch -c ada', 'git commit -am "Add Ada"')
    withEdit(s, 'docs/welcome.md', 'Hello!\n').run(
      'git add docs/welcome.md',
      'git commit --amend --no-edit'
    )
    const local = s.state.git.local!
    const tip = local.commits[local.branches.ada]
    expect(tip.message).toBe('Add Ada')
    expect(tip.tree['docs/welcome.md']).toBe('Hello!\n')
    expect(s.run('git status -s').lastText).toBe('')
  })

  it('asks for -m or --no-edit instead of opening an editor', () => {
    const s = appendAda(inRepo()).run('git commit -am "Add Ada"', 'git commit --amend')
    expect(s.ok).toBe(false)
    expect(s.lastText).toContain('git commit --amend -m "A better message"')
    expect(s.lastText).toContain('git commit --amend --no-edit')
  })

  it('warns when the commit being amended is already on GitNub', () => {
    const local = appendAda(inRepo()).run('git commit -am "Add Ada"', 'git commit --amend -m "x"')
    expect(local.lastText).not.toContain('already on GitNub')
    const shared = inRepo().run('git commit --amend -m "Rename the README"')
    expect(shared.ok).not.toBe(false)
    expect(shared.lastText).toContain('That commit was already on GitNub')
  })
})

describe('git log and git show', () => {
  it('log shows history newest first, with decorations', () => {
    const s = appendAda(inRepo()).run('git commit -am "Add Ada"', 'git log --oneline')
    const lines = s.lastText.split('\n')
    expect(lines[0]).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) Add Ada$/)
    expect(lines[1]).toMatch(/^[0-9a-f]{7} \(origin\/main, origin\/HEAD\) Add team list$/)
    expect(s.run('git log').lastText).toMatch(
      /^commit [0-9a-f]{40} \(HEAD -> main\)\nAuthor: Ada Lovelace <ada@inkwell\.example>/
    )
  })

  it('log takes a ref, -n and -N', () => {
    const s = appendAda(inRepo()).run('git commit -am "Add Ada"')
    expect(s.run('git log --oneline origin/main').lastText.split('\n')[0]).toContain(
      'Add team list'
    )
    expect(s.run('git log --oneline -1').lastText.split('\n')).toHaveLength(1)
    expect(s.run('git log --oneline -n 2').lastText.split('\n')).toHaveLength(2)
    expect(s.run('git log nope').lastText).toContain("fatal: ambiguous argument 'nope'")
  })

  it('show prints the commit and its diff', () => {
    const s = appendAda(inRepo()).run('git commit -am "Add Ada"', 'git show')
    expect(s.lastText).toContain('    Add Ada')
    expect(s.lastText).toContain('+- Ada Lovelace')
    expect(s.run('git show HEAD~1').lastText).toContain('    Add team list')
    expect(s.run('git show zzz').ok).toBe(false)
  })

  it('all of these need a repo', () => {
    for (const command of [
      'git status',
      'git add .',
      'git diff',
      'git commit -m x',
      'git log',
      'git show',
      'git restore x',
    ]) {
      expect(session().run(command).lastText).toContain('fatal: not a git repository')
    }
  })
})
