/**
 * Pull requests, as GitNub does them: open a PR from a branch, get it reviewed, bring it up to
 * date with the base branch, and squash-merge it into one commit.
 */
import {
  findMergeBase,
  mergeTrees,
  replay,
  resolveConflict,
  type ConflictChoice,
  type ConflictedFile,
  type MergeTreesResult,
} from './merge'
import { headId, isAncestor, log, makeCommit, reachable } from './repo'
import { diffTrees } from './tree'
import type { Commit, CommitId, FileTree, LocalRepo, Person, RemoteRepo } from './types'

export type PullRequestStatus = 'open' | 'needs-update' | 'has-conflicts' | 'merged' | 'closed'

export interface PullRequestComment {
  author: string
  body: string
  timestamp: number
  kind: 'comment' | 'approval'
}

export interface PullRequest {
  number: number
  branch: string
  base: string
  title: string
  body: string
  status: PullRequestStatus
  /** Set once a teammate has reviewed. */
  reviewState?: 'approved' | 'commented'
  comments: PullRequestComment[]
  openedAt: number
  /** The squash commit, once merged. */
  mergedCommit?: CommitId
  /** Set after conflicts were resolved on GitNub: where the branch was before, for Undo. */
  resolvedFrom?: CommitId
  branchDeleted?: boolean
}

export function findPullRequest(remote: RemoteRepo, number: number): PullRequest | undefined {
  return remote.pullRequests.find((pr) => pr.number === number)
}

export function openPullRequestFor(remote: RemoteRepo, branch: string): PullRequest | undefined {
  return remote.pullRequests.find(
    (pr) => pr.branch === branch && pr.status !== 'merged' && pr.status !== 'closed'
  )
}

/** The commits on `branch` that aren't on `base` yet, oldest first. */
export function pullRequestCommits(remote: RemoteRepo, pr: PullRequest): Commit[] {
  const baseTip = remote.branches[pr.base]
  const branchTip = remote.branches[pr.branch]
  if (!branchTip) return []
  const onBase = baseTip ? reachable(remote.commits, baseTip) : new Set<CommitId>()
  return log(remote.commits, branchTip)
    .filter((commit) => !onBase.has(commit.id))
    .reverse()
}

/** Where the branch and the base last agreed. */
export function mergeBase(remote: RemoteRepo, pr: PullRequest): CommitId | undefined {
  const branchTip = remote.branches[pr.branch]
  const baseTip = remote.branches[pr.base]
  if (!branchTip || !baseTip) return undefined
  return findMergeBase(remote.commits, branchTip, baseTip)
}

/**
 * The PR's changes combined with whatever has landed on the base since it branched off. "Ours" is
 * the PR branch and "theirs" is the base, as when you merge `main` into your branch.
 */
export function pullRequestMerge(remote: RemoteRepo, pr: PullRequest): MergeTreesResult {
  const base = mergeBase(remote, pr)
  return mergeTrees(
    base ? remote.commits[base].tree : {},
    remote.commits[remote.branches[pr.branch]].tree,
    remote.commits[remote.branches[pr.base]].tree
  )
}

/** Files where the PR and the base changed the same lines. Empty when it can merge cleanly. */
export function pullRequestConflicts(remote: RemoteRepo, pr: PullRequest): ConflictedFile[] {
  if (!remote.branches[pr.branch] || !remote.branches[pr.base]) return []
  const merged = pullRequestMerge(remote, pr)
  return merged.ok ? [] : merged.conflicts
}

/** Open PRs go stale when the base branch moves on, and conflict when it moved the same lines. */
export function derivePullRequestStatus(remote: RemoteRepo, pr: PullRequest): PullRequestStatus {
  if (pr.status === 'merged' || pr.status === 'closed') return pr.status
  const baseTip = remote.branches[pr.base]
  const branchTip = remote.branches[pr.branch]
  if (!baseTip || !branchTip) return pr.status
  if (isAncestor(remote.commits, baseTip, branchTip)) return 'open'
  return pullRequestConflicts(remote, pr).length > 0 ? 'has-conflicts' : 'needs-update'
}

export function refreshPullRequests(remote: RemoteRepo): RemoteRepo {
  return {
    ...remote,
    pullRequests: remote.pullRequests.map((pr) => ({
      ...pr,
      status: derivePullRequestStatus(remote, pr),
    })),
  }
}

export function openPullRequest(
  remote: RemoteRepo,
  input: { branch: string; title: string; body?: string; base?: string; timestamp: number }
): { remote: RemoteRepo; pullRequest: PullRequest } {
  const pullRequest: PullRequest = {
    number: remote.nextPullRequest,
    branch: input.branch,
    base: input.base ?? remote.defaultBranch,
    title: input.title,
    body: input.body ?? '',
    status: 'open',
    comments: [],
    openedAt: input.timestamp,
  }
  const next = refreshPullRequests({
    ...remote,
    pullRequests: [...remote.pullRequests, pullRequest],
    nextPullRequest: remote.nextPullRequest + 1,
  })
  return { remote: next, pullRequest: findPullRequest(next, pullRequest.number)! }
}

export function reviewPullRequest(
  remote: RemoteRepo,
  number: number,
  review: { author: string; body: string; approve: boolean; timestamp: number }
): RemoteRepo {
  return {
    ...remote,
    pullRequests: remote.pullRequests.map((pr) =>
      pr.number === number
        ? {
            ...pr,
            reviewState: review.approve ? 'approved' : 'commented',
            comments: [
              ...pr.comments,
              {
                author: review.author,
                body: review.body,
                timestamp: review.timestamp,
                kind: review.approve ? ('approval' as const) : ('comment' as const),
              },
            ],
          }
        : pr
    ),
  }
}

/** The message GitNub composes for a squash merge, shown in the merge box before you click. */
export function squashMessage(pr: PullRequest, commits: Commit[]): string {
  const body = [pr.body.trim(), ...commits.map((commit) => `* ${commit.message.split('\n')[0]}`)]
    .filter(Boolean)
    .join('\n\n')
  return `${pr.title} (#${pr.number})${body ? `\n\n${body}` : ''}`
}

/**
 * Collapses every commit on the branch into one new commit on the base branch. If the base has
 * moved on, its changes are kept: the squash commit is the 3-way merge of the two. Throws on a PR
 * with conflicts — GitNub doesn't offer the button then.
 */
export function squashMerge(
  remote: RemoteRepo,
  pr: PullRequest,
  options: { author: Person; timestamp: number }
): { remote: RemoteRepo; commit: Commit } {
  const merged = pullRequestMerge(remote, pr)
  if (!merged.ok) throw new Error(`Pull request #${pr.number} has conflicts`)
  const commit = makeCommit({
    parents: [remote.branches[pr.base]],
    message: squashMessage(pr, pullRequestCommits(remote, pr)),
    author: options.author,
    timestamp: options.timestamp,
    tree: merged.tree,
  })
  const next: RemoteRepo = {
    ...remote,
    commits: { ...remote.commits, [commit.id]: commit },
    branches: { ...remote.branches, [pr.base]: commit.id },
    pullRequests: remote.pullRequests.map((candidate) =>
      candidate.number === pr.number
        ? { ...candidate, status: 'merged' as const, mergedCommit: commit.id }
        : candidate
    ),
  }
  return { remote: refreshPullRequests(next), commit }
}

/**
 * Resolves a conflicted PR the way GitNub's web editor does: a merge commit on the PR branch,
 * *Merge branch 'main' into my-branch*, with each file resolved by the choice given for it
 * (default: `both`). Afterwards the PR is up to date and can be squash-merged.
 */
export function resolvePullRequestConflicts(
  remote: RemoteRepo,
  pr: PullRequest,
  options: {
    choices?: Record<string, ConflictChoice | ConflictChoice[]>
    author: Person
    timestamp: number
  }
): { remote: RemoteRepo; commit: Commit } {
  const base = mergeBase(remote, pr)
  const branchTip = remote.branches[pr.branch]
  const baseTip = remote.branches[pr.base]
  const merged = mergeTrees(
    base ? remote.commits[base].tree : {},
    remote.commits[branchTip].tree,
    remote.commits[baseTip].tree
  )
  const tree: FileTree = merged.ok
    ? merged.tree
    : { ...merged.tree, ...resolvedTree(merged.conflicts, options.choices) }
  const commit = makeCommit({
    parents: [branchTip, baseTip],
    message: `Merge branch '${pr.base}' into ${pr.branch}`,
    author: options.author,
    timestamp: options.timestamp,
    tree,
  })
  return {
    commit,
    remote: refreshPullRequests({
      ...remote,
      commits: { ...remote.commits, [commit.id]: commit },
      branches: { ...remote.branches, [pr.branch]: commit.id },
      pullRequests: remote.pullRequests.map((candidate) =>
        candidate.number === pr.number ? { ...candidate, resolvedFrom: branchTip } : candidate
      ),
    }),
  }
}

/**
 * Takes back a conflict resolution that hasn't been merged yet, so a different choice can be
 * made. Flack's own safety net: nothing here should be permanently wrong.
 */
export function undoConflictResolution(remote: RemoteRepo, pr: PullRequest): RemoteRepo {
  const tip = remote.branches[pr.branch]
  if (!pr.resolvedFrom || !tip || remote.commits[tip].parents[0] !== pr.resolvedFrom) return remote
  return refreshPullRequests({
    ...remote,
    branches: { ...remote.branches, [pr.branch]: pr.resolvedFrom },
    pullRequests: remote.pullRequests.map((candidate) =>
      candidate.number === pr.number ? { ...candidate, resolvedFrom: undefined } : candidate
    ),
  })
}

function resolvedTree(
  conflicts: ConflictedFile[],
  choices: Record<string, ConflictChoice | ConflictChoice[]> = {}
): FileTree {
  const tree: FileTree = {}
  for (const file of conflicts) {
    const content = resolveConflict(file, choices[file.path] ?? 'both')
    if (content !== undefined) tree[file.path] = content
  }
  return tree
}

export type UpdateBranchResult =
  | {
      ok: true
      remote: RemoteRepo
      local?: LocalRepo
      /** The branch tip before and after, for the little before/after graph. */
      from: CommitId
      to: CommitId
      /** True when the learner's clone was moved along too. */
      updatedLocal: boolean
    }
  | { ok: false; conflicts: ConflictedFile[] }

/**
 * GitNub's **Update branch**: replays the branch's commits on top of the current base tip
 * (a rebase), each 3-way merged so nothing the base changed is lost. Refuses when they conflict.
 * The learner's clone follows along when it's safe: same branch, nothing uncommitted, and nothing
 * local that GitNub hasn't got.
 */
export function updateBranch(
  remote: RemoteRepo,
  pr: PullRequest,
  local?: LocalRepo,
  options: { timestamp?: number } = {}
): UpdateBranchResult {
  const from = remote.branches[pr.branch]
  const baseTip = remote.branches[pr.base]
  const replayed = replay(
    remote.commits,
    pullRequestCommits(remote, pr),
    baseTip,
    options.timestamp
  )
  if (!replayed.ok) return { ok: false, conflicts: replayed.conflicts }
  const tip = replayed.tip

  const nextCommits = { ...remote.commits }
  for (const commit of replayed.commits) nextCommits[commit.id] = commit
  const nextRemote = refreshPullRequests({
    ...remote,
    commits: nextCommits,
    branches: { ...remote.branches, [pr.branch]: tip },
  })

  let nextLocal = local
  let updatedLocal = false
  if (local && local.head === pr.branch && local.branches[pr.branch] === from) {
    const headTree = local.commits[headId(local)].tree
    const clean =
      diffTrees(headTree, local.index).length === 0 &&
      diffTrees(headTree, local.working).length === 0
    if (clean) {
      const tree = nextCommits[tip].tree
      nextLocal = {
        ...local,
        commits: { ...local.commits, ...nextCommits },
        branches: { ...local.branches, [pr.branch]: tip },
        remoteBranches: { ...local.remoteBranches, ...nextRemote.branches },
        index: { ...tree },
        working: { ...tree },
      }
      updatedLocal = true
    }
  }

  return { ok: true, remote: nextRemote, local: nextLocal, from, to: tip, updatedLocal }
}

export function deleteRemoteBranch(remote: RemoteRepo, branch: string): RemoteRepo {
  const branches = { ...remote.branches }
  delete branches[branch]
  return {
    ...remote,
    branches,
    pullRequests: remote.pullRequests.map((pr) =>
      pr.branch === branch && pr.status === 'merged' ? { ...pr, branchDeleted: true } : pr
    ),
  }
}
