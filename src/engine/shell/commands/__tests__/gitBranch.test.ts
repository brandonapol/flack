import { describe, expect, it } from 'vitest'

import { isValidBranchName } from '../../../git/branches'
import { promptFor } from '../../prompt'
import { inRepo } from './harness'

function edit(s: ReturnType<typeof inRepo>, path: string, content: string) {
  const local = s.state.git.local!
  s.state = {
    ...s.state,
    git: { ...s.state.git, local: { ...local, working: { ...local.working, [path]: content } } },
  }
  return s
}

function addAdaOnBranch() {
  const s = inRepo().run('git switch -c ada-team-list')
  edit(s, 'team.md', `${s.state.git.local!.working['team.md']}- Ada Lovelace\n`)
  return s.run('git commit -am "Add Ada Lovelace to team list"')
}

describe('git switch', () => {
  it('-c creates a branch, switches to it and shows it in the prompt', () => {
    const s = inRepo().run('git switch -c ada-team-list')
    expect(s.lastText).toBe("Switched to a new branch 'ada-team-list'")
    expect(s.state.git.local!.head).toBe('ada-team-list')
    expect(promptFor(s.state)).toBe('~/docs-site (ada-team-list) $')
    expect(s.run('git branch').lastText).toBe('* ada-team-list\n  main')
  })

  it('a commit advances only the current branch', () => {
    const s = addAdaOnBranch()
    const local = s.state.git.local!
    expect(local.branches['ada-team-list']).not.toBe(local.branches.main)
    expect(local.commits[local.branches['ada-team-list']].parents).toEqual([local.branches.main])
    expect(s.lastText).toMatch(/^\[ada-team-list [0-9a-f]{7}\] Add Ada Lovelace to team list/)
  })

  it('switching back to main swaps the files and prints tracking info', () => {
    const s = addAdaOnBranch().run('git switch main')
    expect(s.lastText).toBe(
      "Switched to branch 'main'\nYour branch is up to date with 'origin/main'."
    )
    expect(s.state.git.local!.working['team.md']).not.toContain('Ada')
    s.run('git switch main')
    expect(s.lastText).toBe("Already on 'main'\nYour branch is up to date with 'origin/main'.")
    s.run('git switch ada-team-list')
    expect(s.state.git.local!.working['team.md']).toContain('Ada')
  })

  it('errors: existing, unknown, spaces and missing names', () => {
    const s = inRepo().run('git switch -c main')
    expect(s.lastText).toContain("fatal: a branch named 'main' already exists")
    expect(s.run('git switch nope').lastText).toContain('fatal: invalid reference: nope')
    expect(s.run('git switch -c add my name').lastText).toContain(
      "fatal: 'add my name' is not a valid branch name"
    )
    expect(s.run('git switch -c "add my name"').lastText).toContain('Use dashes instead')
    expect(s.run('git switch').lastText).toBe('fatal: missing branch or commit argument')
    expect(s.run('git switch -c').lastText).toBe("error: switch `c' requires a value")
    expect(s.state.git.local!.head).toBe('main')
  })

  it('refuses when a saved edit would be overwritten, but carries safe edits along', () => {
    const s = addAdaOnBranch().run('git switch main')
    edit(s, 'team.md', 'my unsaved idea\n').run('git switch ada-team-list')
    expect(s.lastText).toContain(
      'error: Your local changes to the following files would be overwritten by checkout:\n\tteam.md'
    )
    expect(s.state.git.local!.head).toBe('main')

    edit(s, 'team.md', s.state.git.local!.index['team.md'])
    edit(s, 'README.md', 'edited\n').run('git switch ada-team-list')
    expect(s.state.git.local!.head).toBe('ada-team-list')
    expect(s.state.git.local!.working['README.md']).toBe('edited\n')
  })

  it('switching to a branch that only exists on GitNub creates a tracking branch', () => {
    const s = inRepo()
    const local = s.state.git.local!
    s.state = {
      ...s.state,
      git: {
        ...s.state.git,
        local: {
          ...local,
          remoteBranches: { ...local.remoteBranches, 'sam-tip': local.branches.main },
        },
      },
    }
    s.run('git switch sam-tip')
    expect(s.lastText).toBe(
      "Switched to a new branch 'sam-tip'\nbranch 'sam-tip' set up to track 'origin/sam-tip'."
    )
    expect(s.state.git.local!.upstreams['sam-tip']).toBe('sam-tip')
  })

  it('emits branch events for story goals', () => {
    const s = inRepo().run('git switch -c ada-team-list')
    expect(s.events.slice(1)).toEqual([
      { type: 'branchCreated', branch: 'ada-team-list' },
      { type: 'branchSwitched', branch: 'ada-team-list' },
    ])
    edit(s, 'team.md', 'x\n').run('git commit -am x', 'git push -u origin ada-team-list')
    expect(s.events.slice(1)).toEqual([
      { type: 'branchPushed', branch: 'ada-team-list', created: true },
    ])
  })
})

describe('git checkout', () => {
  it('-b and <branch> work, with a tip about switch', () => {
    const s = inRepo().run('git checkout -b ada-team-list')
    expect(s.lastText).toBe(
      "Switched to a new branch 'ada-team-list'\n💡 Newer Git calls this `git switch`. Both work."
    )
    expect(s.run('git checkout main').lastText).toContain("Switched to branch 'main'")
  })

  it('<file> discards changes, the old way', () => {
    const s = edit(inRepo(), 'team.md', 'oops\n').run('git checkout team.md')
    expect(s.lastText).toContain('Updated 1 path from the index')
    expect(s.state.git.local!.working['team.md']).not.toBe('oops\n')
    expect(s.run('git checkout -- nope.md').lastText).toContain(
      "error: pathspec 'nope.md' did not match"
    )
  })
})

describe('pushing a branch', () => {
  it('status on a new branch has no upstream, and plain push explains -u', () => {
    const s = addAdaOnBranch()
    expect(s.run('git status').lastText).toBe(
      'On branch ada-team-list\nnothing to commit, working tree clean'
    )
    s.run('git push')
    expect(s.lastText).toContain('fatal: The current branch ada-team-list has no upstream branch.')
    expect(s.lastText).toContain('    git push --set-upstream origin ada-team-list')
    expect(s.ok).toBe(false)
  })

  it('push -u origin <branch> creates it on GitNub, sets upstream and nudges toward a pull request', () => {
    const s = addAdaOnBranch().run('git push -u origin ada-team-list')
    expect(s.state.git.remotes['inkwell/docs-site'].branches['ada-team-list']).toBe(
      s.state.git.local!.branches['ada-team-list']
    )
    expect(s.lastText).toContain(
      "remote: Create a pull request for 'ada-team-list' on GitNub by visiting:"
    )
    expect(s.lastText).toContain(' * [new branch]      ada-team-list -> ada-team-list')
    expect(s.lastText).toContain("branch 'ada-team-list' set up to track 'origin/ada-team-list'.")
    expect(s.run('git status').lastText).toContain(
      "Your branch is up to date with 'origin/ada-team-list'."
    )
    expect(s.run('git push').lastText).toBe('Everything up-to-date')
    expect(promptFor(s.state)).toBe('~/docs-site (ada-team-list) $')
  })

  it('--set-upstream and HEAD work too', () => {
    const s = addAdaOnBranch().run('git push --set-upstream origin HEAD')
    expect(s.state.git.local!.upstreams['ada-team-list']).toBe('ada-team-list')
  })
})

describe('git branch -d', () => {
  it('deletes a merged branch, refuses the current one', () => {
    const s = inRepo().run('git switch -c tmp', 'git switch main', 'git branch -d tmp')
    expect(s.lastText).toMatch(/^Deleted branch tmp \(was [0-9a-f]{7}\)\.$/)
    expect(s.run('git branch -d main').lastText).toContain("error: cannot delete branch 'main'")
  })

  it('refuses an unmerged branch with a squash-merge explanation; -D forces it', () => {
    const s = addAdaOnBranch().run('git switch main', 'git branch -d ada-team-list')
    expect(s.lastText).toContain("error: the branch 'ada-team-list' is not fully merged")
    expect(s.lastText).toContain('squash merge')
    expect(s.run('git branch -D ada-team-list').lastText).toMatch(/^Deleted branch ada-team-list/)
    expect(s.state.git.local!.branches['ada-team-list']).toBeUndefined()
  })

  it('--show-current prints the branch', () => {
    expect(inRepo().run('git branch --show-current').lastText).toBe('main')
  })
})

describe('isValidBranchName', () => {
  it('follows Git’s main rules', () => {
    for (const good of ['add-my-name', 'ada/team-list', 'fix_typo', 'v1.2'])
      expect(isValidBranchName(good), good).toBe(true)
    for (const bad of [
      'add my name',
      '-x',
      'a..b',
      'x.lock',
      'a/',
      '.hidden',
      'what?',
      'HEAD',
      '',
    ]) {
      expect(isValidBranchName(bad), bad).toBe(false)
    }
  })
})
