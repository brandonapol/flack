/**
 * Pull requests, as GitNub does them: open a PR from a branch, get it reviewed, bring it up to
 * date with the base branch, and squash-merge it into one commit.
 */
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
  const onBranch = reachable(remote.commits, branchTip)
  for (const commit of log(remote.commits, baseTip)) {
    if (onBranch.has(commit.id)) return commit.id
  }
  return undefined
}

/** Open PRs go stale when the base branch moves on. Conflict detection arrives with #36. */
export function derivePullRequestStatus(remote: RemoteRepo, pr: PullRequest): PullRequestStatus {
  if (pr.status === 'merged' || pr.status === 'closed') return pr.status
  const baseTip = remote.branches[pr.base]
  const branchTip = remote.branches[pr.branch]
  if (!baseTip || !branchTip) return pr.status
  return isAncestor(remote.commits, baseTip, branchTip) ? 'open' : 'needs-update'
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

/** Collapses every commit on the branch into one new commit on the base branch. */
export function squashMerge(
  remote: RemoteRepo,
  pr: PullRequest,
  options: { author: Person; timestamp: number }
): { remote: RemoteRepo; commit: Commit } {
  const commits = pullRequestCommits(remote, pr)
  const branchTip = remote.branches[pr.branch]
  const baseTip = remote.branches[pr.base]
  const commit = makeCommit({
    parents: [baseTip],
    message: squashMessage(pr, commits),
    author: options.author,
    timestamp: options.timestamp,
    tree: remote.commits[branchTip].tree,
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

/** Replays a run of commits onto a new parent, keeping each commit's own changes. */
export function replayCommits(
  commits: Commit[],
  onto: CommitId,
  ontoTree: FileTree,
  lookup: (id: CommitId) => Commit,
  /** Replayed commits are new commits, so they get a new time, as after a real rebase. */
  timestamp?: number
): { commits: Commit[]; tree: FileTree } {
  let parent = onto
  let tree = ontoTree
  const replayed: Commit[] = []
  for (const commit of commits) {
    const before = commit.parents[0] ? lookup(commit.parents[0]).tree : {}
    const next = { ...tree }
    for (const change of diffTrees(before, commit.tree)) {
      if (change.kind === 'deleted') delete next[change.path]
      else next[change.path] = commit.tree[change.path]
    }
    const rebased = makeCommit({
      ...commit,
      parents: [parent],
      tree: next,
      timestamp: timestamp ?? commit.timestamp,
    })
    replayed.push(rebased)
    parent = rebased.id
    tree = next
  }
  return { commits: replayed, tree }
}

export interface UpdateBranchResult {
  remote: RemoteRepo
  local?: LocalRepo
  /** The branch tip before and after, for the little before/after graph. */
  from: CommitId
  to: CommitId
  /** True when the learner's clone was moved along too. */
  updatedLocal: boolean
}

/**
 * GitNub's **Update branch**: replays the branch's commits on top of the current base tip
 * (a rebase). The learner's clone follows along when it's safe: same branch, nothing uncommitted,
 * and nothing local that GitNub hasn't got.
 */
export function updateBranch(
  remote: RemoteRepo,
  pr: PullRequest,
  local?: LocalRepo,
  options: { timestamp?: number } = {}
): UpdateBranchResult {
  const from = remote.branches[pr.branch]
  const baseTip = remote.branches[pr.base]
  const commits = pullRequestCommits(remote, pr)
  const { commits: replayed } = replayCommits(
    commits,
    baseTip,
    remote.commits[baseTip].tree,
    (id) => remote.commits[id],
    options.timestamp
  )
  const tip = replayed[replayed.length - 1]?.id ?? baseTip

  const nextCommits = { ...remote.commits }
  for (const commit of replayed) nextCommits[commit.id] = commit
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

  return { remote: nextRemote, local: nextLocal, from, to: tip, updatedLocal }
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
