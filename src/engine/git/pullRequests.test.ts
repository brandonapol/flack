import { describe, expect, it } from 'vitest'

import { ada, docsSite, sam, T0 } from './__fixtures__/docsSite'
import { switchBranch } from './branches'
import { clone, commit, log, stage } from './repo'
import {
  deleteRemoteBranch,
  findPullRequest,
  openPullRequest,
  pullRequestCommits,
  pullRequestConflicts,
  refreshPullRequests,
  resolvePullRequestConflicts,
  reviewPullRequest,
  squashMerge,
  squashMessage,
  updateBranch,
} from './pullRequests'
import { appendLine, push, remoteCommit, replaceText } from './sync'
import type { FileTree, LocalRepo, RemoteRepo } from './types'

/** Ada branches, makes two commits, and pushes the branch. */
function adaBranch(): { remote: RemoteRepo; local: LocalRepo } {
  let remote = docsSite()
  const switched = switchBranch(clone(remote), 'ada-team-list', { create: true })
  if (!switched.ok) throw new Error()
  let local = switched.local
  for (const line of ['- Ada Lovelace', '- (she/they) docs']) {
    const edited = { ...local, working: appendLine('team.md', line)(local.working) }
    const staged = stage(edited, ['.'])
    if (!staged.ok) throw new Error()
    const result = commit(staged.local, {
      message: `Add ${line}`,
      config: ada,
      timestamp: T0 + 600,
    })
    if (!result.ok) throw new Error(result.error)
    local = result.local
  }
  const pushed = push(local, remote, { branch: 'ada-team-list', setUpstream: true })
  if (pushed.kind !== 'pushed') throw new Error(pushed.kind)
  remote = pushed.remote
  return { remote, local: pushed.local }
}

const openAdaPr = (remote: RemoteRepo) =>
  openPullRequest(remote, {
    branch: 'ada-team-list',
    title: 'Add Ada Lovelace to the team list',
    body: 'First day!',
    timestamp: T0 + 700,
  })

describe('opening a pull request', () => {
  it('numbers it after the ones already in the history and lists its commits', () => {
    const { remote } = adaBranch()
    const { remote: withPr, pullRequest } = openAdaPr(remote)
    expect(pullRequest.number).toBe(1)
    expect(pullRequest).toMatchObject({ branch: 'ada-team-list', base: 'main', status: 'open' })
    expect(pullRequestCommits(withPr, pullRequest).map((c) => c.message)).toEqual([
      'Add - Ada Lovelace',
      'Add - (she/they) docs',
    ])
  })

  it('records a review', () => {
    const { remote } = adaBranch()
    const { remote: withPr } = openAdaPr(remote)
    const reviewed = reviewPullRequest(withPr, 1, {
      author: 'robin',
      body: 'Welcome aboard!',
      approve: true,
      timestamp: T0 + 800,
    })
    expect(findPullRequest(reviewed, 1)).toMatchObject({
      reviewState: 'approved',
      comments: [{ author: 'robin', kind: 'approval' }],
    })
  })
})

describe('squash merge', () => {
  it('turns every commit on the branch into one commit on main', () => {
    const { remote } = adaBranch()
    const { remote: withPr, pullRequest } = openAdaPr(remote)
    const before = withPr.branches.main
    const { remote: merged, commit: squashed } = squashMerge(withPr, pullRequest, {
      author: { name: 'Ada Lovelace', email: 'ada@inkwell.example' },
      timestamp: T0 + 900,
    })

    expect(merged.branches.main).toBe(squashed.id)
    expect(squashed.parents).toEqual([before])
    expect(log(merged.commits, merged.branches.main)).toHaveLength(3)
    expect(squashed.message).toBe(
      'Add Ada Lovelace to the team list\n\nSee merge request inkwell/docs-site!1'
    )
    expect(squashed.tree['team.md']).toContain('- Ada Lovelace')
    expect(findPullRequest(merged, 1)).toMatchObject({
      status: 'merged',
      mergedCommit: squashed.id,
    })
  })

  it('previews exactly the message it will use', () => {
    const { remote } = adaBranch()
    const { remote: withPr, pullRequest } = openAdaPr(remote)
    const preview = squashMessage(withPr.slug, pullRequest)
    const { commit: squashed } = squashMerge(withPr, pullRequest, {
      author: { name: 'Ada', email: 'a@b.c' },
      timestamp: T0,
    })
    expect(squashed.message).toBe(preview)
  })

  it('deleting the branch afterwards leaves the commit alone', () => {
    const { remote } = adaBranch()
    const { remote: withPr, pullRequest } = openAdaPr(remote)
    const { remote: merged } = squashMerge(withPr, pullRequest, {
      author: { name: 'Ada', email: 'a@b.c' },
      timestamp: T0,
    })
    const cleaned = deleteRemoteBranch(merged, 'ada-team-list')
    expect(cleaned.branches['ada-team-list']).toBeUndefined()
    expect(findPullRequest(cleaned, 1)).toMatchObject({ status: 'merged', branchDeleted: true })
    expect(cleaned.commits[merged.branches.main]).toBeDefined()
  })
})

describe('out of date branches', () => {
  it('a PR needs updating once main moves on', () => {
    const { remote } = adaBranch()
    const { remote: withPr } = openAdaPr(remote)
    expect(findPullRequest(withPr, 1)?.status).toBe('open')

    const { remote: moved } = remoteCommit(withPr, {
      author: sam,
      message: 'Add Sam (#5)',
      change: appendLine('docs/welcome.md', 'Hello from Sam'),
      timestamp: T0 + 1000,
    })
    expect(findPullRequest(refreshPullRequests(moved), 1)?.status).toBe('needs-update')
  })

  it('Update branch replays the commits on top of main, and takes the clone along', () => {
    const { remote, local } = adaBranch()
    const { remote: withPr } = openAdaPr(remote)
    const { remote: moved } = remoteCommit(withPr, {
      author: sam,
      message: 'Fix a typo (#5)',
      change: appendLine('docs/welcome.md', 'Hello from Sam'),
      timestamp: T0 + 1000,
    })
    const stale = refreshPullRequests(moved)
    const pr = findPullRequest(stale, 1)!

    const result = updateBranch(stale, pr, local, { timestamp: T0 + 1200 })
    if (!result.ok) throw new Error('conflict')
    expect(result.updatedLocal).toBe(true)
    expect(findPullRequest(result.remote, 1)?.status).toBe('open')
    expect(result.to).not.toBe(result.from)

    const branchLog = log(result.remote.commits, result.remote.branches['ada-team-list'])
    expect(branchLog.map((c) => c.message.split('\n')[0])).toEqual([
      'Add - (she/they) docs',
      'Add - Ada Lovelace',
      'Fix a typo (#5)',
      'Add team list',
      'Start the docs site',
    ])
    const tip = result.remote.commits[result.remote.branches['ada-team-list']]
    expect(tip.tree['team.md']).toContain('- Ada Lovelace')
    expect(tip.tree['docs/welcome.md']).toContain('Hello from Sam')
    expect(result.local!.working).toEqual(tip.tree)
    expect(result.local!.branches['ada-team-list']).toBe(tip.id)
  })

  it('leaves the clone alone when it has unsaved or unpushed work', () => {
    const { remote, local } = adaBranch()
    const { remote: withPr } = openAdaPr(remote)
    const { remote: moved } = remoteCommit(withPr, {
      author: sam,
      message: 'Fix a typo',
      change: appendLine('docs/welcome.md', 'Hello'),
      timestamp: T0 + 1000,
    })
    const stale = refreshPullRequests(moved)
    const pr = findPullRequest(stale, 1)!
    const dirty = { ...local, working: { ...local.working, 'team.md': 'mine\n' } }
    const result = updateBranch(stale, pr, dirty)
    if (!result.ok) throw new Error('conflict')
    expect(result.updatedLocal).toBe(false)
    expect(result.local!.branches['ada-team-list']).toBe(local.branches['ada-team-list'])
  })
})

describe('conflicts', () => {
  /** Ada's PR is open; then `change` lands on main. */
  function baseMoves(change: (tree: FileTree) => FileTree) {
    const { remote } = adaBranch()
    const opened = openAdaPr(remote).remote
    const moved = remoteCommit(opened, {
      author: sam,
      message: 'Sam’s change (#5)',
      change,
      timestamp: T0 + 1000,
    }).remote
    const next = refreshPullRequests(moved)
    return { remote: next, pr: findPullRequest(next, 1)! }
  }
  const author = { name: 'Ada', email: 'ada@inkwell.example' }

  it('a change to other lines only makes the PR out of date', () => {
    const { remote, pr } = baseMoves(replaceText('README.md', 'Inkwell', 'The Inkwell'))
    expect(pr.status).toBe('needs-update')
    expect(pullRequestConflicts(remote, pr)).toEqual([])
  })

  it('the same lines changed on main makes it conflict, with both sides in the hunk', () => {
    const { remote, pr } = baseMoves(appendLine('team.md', '- Sam Rivera'))
    expect(pr.status).toBe('has-conflicts')
    const [file] = pullRequestConflicts(remote, pr)
    expect(file.path).toBe('team.md')
    expect(file.hunks).toEqual([
      { ours: ['- Ada Lovelace', '- (she/they) docs'], theirs: ['- Sam Rivera'], context: [] },
    ])
  })

  it('squash-merging an out-of-date PR keeps what landed on main meanwhile', () => {
    const { remote, pr } = baseMoves(replaceText('README.md', 'Inkwell', 'The Inkwell'))
    const { commit } = squashMerge(remote, pr, { author, timestamp: T0 + 1300 })
    expect(commit.tree['README.md']).toContain('The Inkwell')
    expect(commit.tree['team.md']).toContain('- Ada Lovelace')
  })

  it('squash merge and Update branch refuse a conflicted PR', () => {
    const { remote, pr } = baseMoves(appendLine('team.md', '- Sam Rivera'))
    expect(() => squashMerge(remote, pr, { author, timestamp: T0 + 1300 })).toThrow('conflicts')
    const result = updateBranch(remote, pr)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error()
    expect(result.conflicts.map((file) => file.path)).toEqual(['team.md'])
  })

  it('Update branch keeps main’s edits to the same file on other lines', () => {
    const { remote, pr } = baseMoves(replaceText('team.md', '# Docs team', '# The docs team'))
    const result = updateBranch(remote, pr, undefined, { timestamp: T0 + 1200 })
    if (!result.ok) throw new Error('conflict')
    const tree = result.remote.commits[result.to].tree
    expect(tree['team.md']).toContain('# The docs team')
    expect(tree['team.md']).toContain('- (she/they) docs')
  })

  it('resolving with “both” merges main into the branch, then it squash-merges', () => {
    const { remote, pr } = baseMoves(appendLine('team.md', '- Sam Rivera'))
    const resolved = resolvePullRequestConflicts(remote, pr, { author, timestamp: T0 + 1300 })
    expect(resolved.commit.message).toBe("Merge branch 'main' into ada-team-list")
    expect(resolved.commit.parents).toEqual([
      remote.branches['ada-team-list'],
      remote.branches.main,
    ])
    expect(resolved.commit.tree['team.md']).toMatch(
      /- Robin Okafor\n- Ada Lovelace\n- \(she\/they\) docs\n- Sam Rivera\n$/
    )
    const after = findPullRequest(resolved.remote, 1)!
    expect(after.status).toBe('open')

    const { commit } = squashMerge(resolved.remote, after, { author, timestamp: T0 + 1400 })
    expect(commit.tree['team.md']).toBe(resolved.commit.tree['team.md'])
  })

  it('resolving can keep one side', () => {
    const { remote, pr } = baseMoves(appendLine('team.md', '- Sam Rivera'))
    const resolved = resolvePullRequestConflicts(remote, pr, {
      choices: { 'team.md': 'theirs' },
      author,
      timestamp: T0 + 1300,
    })
    expect(resolved.commit.tree['team.md']).toMatch(/- Robin Okafor\n- Sam Rivera\n$/)
    expect(resolved.commit.tree['README.md']).toBe(
      remote.commits[remote.branches.main].tree['README.md']
    )
  })
})
