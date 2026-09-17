/**
 * Talking to GitNub: push, fetch, fast-forward pull, and scripted coworker commits.
 * Diverged histories (3-way merge, rebase) are handled separately in merge.ts.
 */
import { diffStat, type FileStat } from './diff'
import { headId, headTree, isAncestor, makeCommit, reachable } from './repo'
import { sortPaths } from './tree'
import type { Commit, CommitId, CommitMap, FileTree, LocalRepo, Person, RemoteRepo } from './types'

export interface RefUpdate {
  branch: string
  /** Missing for a branch that didn't exist before. */
  from?: CommitId
  to: CommitId
  /** The old tip is not an ancestor of the new one (history was rewritten, e.g. by a rebase). */
  forced: boolean
}

function copyReachable(target: CommitMap, source: CommitMap, tip: CommitId): number {
  let copied = 0
  reachable(source, tip).forEach((id) => {
    if (!target[id]) {
      target[id] = source[id]
      copied++
    }
  })
  return copied
}

/** A plausible object count for progress lines: each new commit brings a commit, a tree and a blob. */
function objectCount(commits: number): number {
  return commits * 3
}

// ---------------------------------------------------------------- push

export type PushResult =
  | {
      ok: true
      kind: 'up-to-date'
      local: LocalRepo
      branch: string
      remoteBranch: string
      setUpstream: boolean
    }
  | {
      ok: true
      kind: 'pushed'
      local: LocalRepo
      remote: RemoteRepo
      branch: string
      remoteBranch: string
      update: RefUpdate
      setUpstream: boolean
      objects: number
    }
  | {
      ok: false
      kind: 'rejected'
      branch: string
      remoteBranch: string
      reason: 'fetch-first' | 'non-fast-forward'
    }
  | { ok: false; kind: 'no-upstream'; branch: string }
  | { ok: false; kind: 'unknown-branch'; branch: string }

export interface PushOptions {
  /** `git push origin <branch>`. Without it, pushes the current branch to its upstream. */
  branch?: string
  /** `-u` / `--set-upstream` */
  setUpstream?: boolean
}

export function push(local: LocalRepo, remote: RemoteRepo, options: PushOptions = {}): PushResult {
  const branch = options.branch ?? local.head
  const setUpstream = options.setUpstream ?? false
  const explicit = options.branch !== undefined

  if (!explicit && !setUpstream && !local.upstreams[branch]) {
    return { ok: false, kind: 'no-upstream', branch }
  }
  const tip = local.branches[branch]
  if (!tip) return { ok: false, kind: 'unknown-branch', branch }

  const remoteBranch = explicit || setUpstream ? branch : local.upstreams[branch]
  const withUpstream = (repo: LocalRepo): LocalRepo =>
    setUpstream ? { ...repo, upstreams: { ...repo.upstreams, [branch]: remoteBranch } } : repo

  const remoteTip = remote.branches[remoteBranch]
  if (remoteTip === tip) {
    return {
      ok: true,
      kind: 'up-to-date',
      branch,
      remoteBranch,
      setUpstream,
      local: withUpstream({
        ...local,
        remoteBranches: { ...local.remoteBranches, [remoteBranch]: tip },
      }),
    }
  }

  if (remoteTip !== undefined) {
    if (!local.commits[remoteTip]) {
      return { ok: false, kind: 'rejected', branch, remoteBranch, reason: 'fetch-first' }
    }
    if (!isAncestor(local.commits, remoteTip, tip)) {
      return { ok: false, kind: 'rejected', branch, remoteBranch, reason: 'non-fast-forward' }
    }
  }

  const remoteCommits = { ...remote.commits }
  const copied = copyReachable(remoteCommits, local.commits, tip)
  return {
    ok: true,
    kind: 'pushed',
    branch,
    remoteBranch,
    setUpstream,
    objects: objectCount(copied),
    update: { branch: remoteBranch, from: remoteTip, to: tip, forced: false },
    remote: {
      ...remote,
      commits: remoteCommits,
      branches: { ...remote.branches, [remoteBranch]: tip },
    },
    local: withUpstream({
      ...local,
      remoteBranches: { ...local.remoteBranches, [remoteBranch]: tip },
    }),
  }
}

// ---------------------------------------------------------------- fetch

export interface FetchResult {
  local: LocalRepo
  /** Sorted by branch name, like Git prints them. Empty when nothing changed. */
  updates: RefUpdate[]
  /** Remote-tracking refs removed by `--prune`. */
  pruned: string[]
  objects: number
}

export function fetch(
  local: LocalRepo,
  remote: RemoteRepo,
  options: { prune?: boolean } = {}
): FetchResult {
  const commits = { ...local.commits }
  let copied = 0
  const updates: RefUpdate[] = []
  for (const branch of sortPaths(Object.keys(remote.branches))) {
    const to = remote.branches[branch]
    copied += copyReachable(commits, remote.commits, to)
    const from = local.remoteBranches[branch]
    if (from === to) continue
    updates.push({
      branch,
      from,
      to,
      forced: from !== undefined && !isAncestor(commits, from, to),
    })
  }

  const remoteBranches = { ...local.remoteBranches, ...remote.branches }
  const pruned: string[] = []
  if (options.prune) {
    for (const branch of sortPaths(Object.keys(local.remoteBranches))) {
      if (!(branch in remote.branches)) {
        delete remoteBranches[branch]
        pruned.push(branch)
      }
    }
  }

  return {
    local: { ...local, commits, remoteBranches },
    updates,
    pruned,
    objects: objectCount(copied),
  }
}

// ---------------------------------------------------------------- fast-forward

export type FastForwardResult =
  | { ok: true; local: LocalRepo; from: CommitId; to: CommitId; stats: FileStat[] }
  | { ok: false; kind: 'would-overwrite' | 'untracked-would-overwrite'; paths: string[] }

function applyChanges(target: FileTree, after: FileTree, paths: string[]): FileTree {
  const next = { ...target }
  for (const path of paths) {
    if (path in after) next[path] = after[path]
    else delete next[path]
  }
  return next
}

/**
 * Moves the current branch forward to `to`, carrying uncommitted edits along as long as none of
 * them touch a file that the incoming commits change — otherwise refuses, like real Git.
 */
export function fastForward(local: LocalRepo, to: CommitId): FastForwardResult {
  const from = headId(local)
  const before = headTree(local)
  const after = local.commits[to].tree
  const stats = diffStat(before, after)
  const changed = stats.map((stat) => stat.path)

  const overwritten = changed.filter((path) =>
    path in local.index || path in before
      ? local.index[path] !== before[path] || local.working[path] !== before[path]
      : false
  )
  if (overwritten.length > 0) return { ok: false, kind: 'would-overwrite', paths: overwritten }

  const untracked = changed.filter(
    (path) =>
      !(path in before) &&
      !(path in local.index) &&
      path in local.working &&
      local.working[path] !== after[path]
  )
  if (untracked.length > 0) {
    return { ok: false, kind: 'untracked-would-overwrite', paths: untracked }
  }

  return {
    ok: true,
    from,
    to,
    stats,
    local: {
      ...local,
      branches: { ...local.branches, [local.head]: to },
      index: applyChanges(local.index, after, changed),
      working: applyChanges(local.working, after, changed),
    },
  }
}

// ---------------------------------------------------------------- pull

export type PullResult =
  | { ok: true; kind: 'up-to-date'; local: LocalRepo; fetch: FetchResult }
  | {
      ok: true
      kind: 'fast-forward'
      local: LocalRepo
      fetch: FetchResult
      from: CommitId
      to: CommitId
      stats: FileStat[]
    }
  | {
      ok: false
      kind: 'would-overwrite' | 'untracked-would-overwrite'
      /** The fetch still happened, so remote-tracking refs are updated. */
      local: LocalRepo
      fetch: FetchResult
      from: CommitId
      to: CommitId
      paths: string[]
    }
  | { ok: false; kind: 'diverged'; local: LocalRepo; fetch: FetchResult; to: CommitId }
  | { ok: false; kind: 'no-tracking'; branch: string }
  | { ok: false; kind: 'no-such-ref'; local: LocalRepo; fetch: FetchResult; remoteBranch: string }

/** `git pull` for the fast-forward case. A diverged branch is reported, not merged. */
export function pull(local: LocalRepo, remote: RemoteRepo): PullResult {
  const remoteBranch = local.upstreams[local.head]
  if (!remoteBranch) return { ok: false, kind: 'no-tracking', branch: local.head }

  const fetched = fetch(local, remote)
  const afterFetch = fetched.local
  const to = remote.branches[remoteBranch]
  if (!to) {
    return { ok: false, kind: 'no-such-ref', local: afterFetch, fetch: fetched, remoteBranch }
  }

  const current = headId(afterFetch)
  if (isAncestor(afterFetch.commits, to, current)) {
    return { ok: true, kind: 'up-to-date', local: afterFetch, fetch: fetched }
  }
  if (!isAncestor(afterFetch.commits, current, to)) {
    return { ok: false, kind: 'diverged', local: afterFetch, fetch: fetched, to }
  }

  const result = fastForward(afterFetch, to)
  if (!result.ok) {
    return { ...result, local: afterFetch, fetch: fetched, from: current, to }
  }
  return { ...result, kind: 'fast-forward', fetch: fetched }
}

// ---------------------------------------------------------------- coworkers

export interface RemoteCommitInput {
  author: Person
  message: string
  /** A function of the current tree, so scripted changes build on whatever the learner pushed. */
  change: (tree: FileTree) => FileTree
  timestamp: number
  branch?: string
}

/** A coworker pushes straight to a branch on GitNub. */
export function remoteCommit(
  remote: RemoteRepo,
  input: RemoteCommitInput
): { remote: RemoteRepo; commit: Commit } {
  const branch = input.branch ?? remote.defaultBranch
  const parent = remote.branches[branch] ?? remote.branches[remote.defaultBranch]
  const created = makeCommit({
    parents: [parent],
    message: input.message,
    author: input.author,
    timestamp: input.timestamp,
    tree: input.change({ ...remote.commits[parent].tree }),
  })
  return {
    commit: created,
    remote: {
      ...remote,
      commits: { ...remote.commits, [created.id]: created },
      branches: { ...remote.branches, [branch]: created.id },
    },
  }
}

/** Small helpers for writing scripted `change` functions. */
export function appendLine(path: string, text: string) {
  return (tree: FileTree): FileTree => {
    const current = tree[path] ?? ''
    const separator = current === '' || current.endsWith('\n') ? '' : '\n'
    return { ...tree, [path]: `${current}${separator}${text}\n` }
  }
}

export function replaceText(path: string, search: string, replacement: string) {
  return (tree: FileTree): FileTree => {
    const current = tree[path]
    if (current === undefined || !current.includes(search)) {
      throw new Error(`replaceText: '${search}' not found in ${path}`)
    }
    return { ...tree, [path]: current.replace(search, replacement) }
  }
}
