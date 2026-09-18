/**
 * Diverged histories: line-level 3-way merge, merge commits and rebase.
 * Conflicts are detected here but never written into files — they surface on GitNub and in the
 * Commit Lab, so these functions report them and leave the repository as it was.
 */
import { diff3Merge } from 'node-diff3'

import { diffStat, type FileStat } from './diff'
import { headId, headTree, isAncestor, log, makeCommit, reachable } from './repo'
import { fastForward } from './sync'
import { diffTrees, sortPaths } from './tree'
import type { Commit, CommitId, CommitMap, FileTree, LocalRepo, Person } from './types'

// ---------------------------------------------------------------- 3-way merge

/** One place where both sides changed the same lines. `context` is the base version of them. */
export interface ConflictHunk {
  ours: string[]
  theirs: string[]
  context: string[]
}

export interface ConflictedFile {
  path: string
  hunks: ConflictHunk[]
  /**
   * The whole file in order: runs of lines both sides agree on, and the index of each hunk where
   * it sits. Enough to rebuild the file once someone picks a side.
   */
  chunks: Array<string[] | number>
  /** Set when one side deleted the file and the other changed it. */
  deletedBy?: 'ours' | 'theirs'
}

export type ConflictChoice = 'ours' | 'theirs' | 'both'

export type MergeTreesResult =
  | { ok: true; tree: FileTree }
  /** `tree` has every file that merged cleanly; the conflicted ones are left out. */
  | { ok: false; conflicts: ConflictedFile[]; tree: FileTree }

type MergeTextResult =
  | { ok: true; text: string }
  | { ok: false; hunks: ConflictHunk[]; chunks: ConflictedFile['chunks'] }

/** Line-level 3-way merge of one file's text. */
export function mergeText(base: string, ours: string, theirs: string): MergeTextResult {
  if (ours === theirs || theirs === base) return { ok: true, text: ours }
  if (ours === base) return { ok: true, text: theirs }

  const regions = diff3Merge(ours.split('\n'), base.split('\n'), theirs.split('\n'))
  const lines: string[] = []
  const hunks: ConflictHunk[] = []
  const chunks: ConflictedFile['chunks'] = []
  for (const region of regions) {
    if (region.ok) {
      lines.push(...region.ok)
      chunks.push(region.ok)
    } else if (region.conflict) {
      const { a, o, b } = region.conflict
      chunks.push(hunks.length)
      hunks.push({ ours: a, theirs: b, context: o })
    }
  }
  return hunks.length > 0 ? { ok: false, hunks, chunks } : { ok: true, text: lines.join('\n') }
}

/**
 * Merges two snapshots that both started from `base`. A change on one side wins; changes to
 * different lines of the same file combine; the same lines changed on both sides is a conflict.
 * A file changed on one side and deleted on the other is a conflict too, with the whole file as
 * one hunk.
 */
export function mergeTrees(base: FileTree, ours: FileTree, theirs: FileTree): MergeTreesResult {
  const tree: FileTree = {}
  const conflicts: ConflictedFile[] = []
  const paths = sortPaths(
    new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  )

  for (const path of paths) {
    const [b, o, t] = [base[path], ours[path], theirs[path]]
    let merged: string | undefined
    if (o === t || t === b) merged = o
    else if (o === b) merged = t
    else if (o === undefined || t === undefined) {
      conflicts.push({
        path,
        hunks: [{ ours: lines(o), theirs: lines(t), context: lines(b) }],
        chunks: [0],
        deletedBy: o === undefined ? 'ours' : 'theirs',
      })
      continue
    } else {
      const result = mergeText(b ?? '', o, t)
      if (!result.ok) {
        conflicts.push({ path, hunks: result.hunks, chunks: result.chunks })
        continue
      }
      merged = result.text
    }
    if (merged !== undefined) tree[path] = merged
  }

  return conflicts.length > 0 ? { ok: false, conflicts, tree } : { ok: true, tree }
}

function lines(text: string | undefined): string[] {
  return text === undefined ? [] : text.replace(/\n$/, '').split('\n')
}

/**
 * The file after picking a side, for every hunk or one choice per hunk. "Both" keeps our lines
 * then theirs. Undefined means the file is deleted (keeping the side that deleted it).
 */
export function resolveConflict(
  file: ConflictedFile,
  choice: ConflictChoice | ConflictChoice[]
): string | undefined {
  const pick = (index: number) => (Array.isArray(choice) ? choice[index] : choice)
  if (file.deletedBy) {
    const kept = pick(0) === 'both' ? (file.deletedBy === 'ours' ? 'theirs' : 'ours') : pick(0)
    if (kept === file.deletedBy) return undefined
    return `${file.hunks[0][kept === 'ours' ? 'ours' : 'theirs'].join('\n')}\n`
  }
  return file.chunks
    .flatMap((chunk) => {
      if (Array.isArray(chunk)) return chunk
      const hunk = file.hunks[chunk]
      const choice = pick(chunk)
      return choice === 'ours'
        ? hunk.ours
        : choice === 'theirs'
          ? hunk.theirs
          : [...hunk.ours, ...hunk.theirs]
    })
    .join('\n')
}

/**
 * The file as a text editor would show it mid-merge, with Git's conflict markers. For display
 * only — "this is what it looks like on your computer". Nothing reads it back.
 */
export function renderMarkers(
  file: ConflictedFile,
  labels: { ours: string; theirs: string } = { ours: 'HEAD', theirs: 'origin/main' }
): string {
  if (file.deletedBy) {
    return resolveConflict(file, file.deletedBy === 'ours' ? 'theirs' : 'ours') ?? ''
  }
  return file.chunks
    .flatMap((chunk) => {
      if (Array.isArray(chunk)) return chunk
      const hunk = file.hunks[chunk]
      return [
        `<<<<<<< ${labels.ours}`,
        ...hunk.ours,
        '=======',
        ...hunk.theirs,
        `>>>>>>> ${labels.theirs}`,
      ]
    })
    .join('\n')
}

/** The best common ancestor of two commits: the newest commit reachable from both. */
export function findMergeBase(commits: CommitMap, a: CommitId, b: CommitId): CommitId | undefined {
  const fromA = reachable(commits, a)
  return log(commits, b).find((commit) => fromA.has(commit.id))?.id
}

// ---------------------------------------------------------------- dirty working tree

/** Paths where the index or the working tree differ from HEAD. */
function dirtyPaths(local: LocalRepo): { staged: string[]; unstaged: string[] } {
  const head = headTree(local)
  return {
    staged: diffTrees(head, local.index).map((change) => change.path),
    unstaged: diffTrees(local.index, local.working).map((change) => change.path),
  }
}

function applyChanges(target: FileTree, from: FileTree, to: FileTree): FileTree {
  const next = { ...target }
  for (const change of diffTrees(from, to)) {
    if (change.kind === 'deleted') delete next[change.path]
    else next[change.path] = to[change.path]
  }
  return next
}

/** Moves HEAD's branch to `tip`, carrying unrelated uncommitted edits along. */
function moveBranch(local: LocalRepo, commits: CommitMap, tip: CommitId): LocalRepo {
  const before = headTree(local)
  const after = commits[tip].tree
  return {
    ...local,
    commits,
    branches: { ...local.branches, [local.head]: tip },
    index: applyChanges(local.index, before, after),
    working: applyChanges(local.working, before, after),
  }
}

// ---------------------------------------------------------------- merge

export interface MergeOptions {
  message: string
  author: Person
  timestamp: number
}

export type MergeResult =
  | { ok: true; kind: 'up-to-date'; local: LocalRepo }
  | {
      ok: true
      kind: 'fast-forward' | 'merge'
      local: LocalRepo
      from: CommitId
      to: CommitId
      stats: FileStat[]
    }
  | { ok: false; kind: 'would-overwrite'; paths: string[] }
  | { ok: false; kind: 'conflict'; conflicts: ConflictedFile[] }

/**
 * `git merge <theirs>`: fast-forwards when it can, otherwise makes a merge commit with two
 * parents. Refuses, like Git, when an uncommitted edit touches a file the merge would change.
 */
export function merge(local: LocalRepo, theirs: CommitId, options: MergeOptions): MergeResult {
  const ours = headId(local)
  if (isAncestor(local.commits, theirs, ours)) return { ok: true, kind: 'up-to-date', local }

  if (isAncestor(local.commits, ours, theirs)) {
    const result = fastForward(local, theirs)
    if (!result.ok) return { ok: false, kind: 'would-overwrite', paths: result.paths }
    return { ...result, kind: 'fast-forward' }
  }

  const base = findMergeBase(local.commits, ours, theirs)
  const baseTree = base ? local.commits[base].tree : {}
  const merged = mergeTrees(baseTree, headTree(local), local.commits[theirs].tree)
  if (!merged.ok) return { ok: false, kind: 'conflict', conflicts: merged.conflicts }

  const changed = diffTrees(headTree(local), merged.tree).map((change) => change.path)
  const { staged, unstaged } = dirtyPaths(local)
  const overwritten = changed.filter((path) => staged.includes(path) || unstaged.includes(path))
  if (overwritten.length > 0) return { ok: false, kind: 'would-overwrite', paths: overwritten }

  const created = makeCommit({
    parents: [ours, theirs],
    message: options.message,
    author: options.author,
    timestamp: options.timestamp,
    tree: merged.tree,
  })
  return {
    ok: true,
    kind: 'merge',
    from: ours,
    to: created.id,
    stats: diffStat(headTree(local), merged.tree),
    local: moveBranch(local, { ...local.commits, [created.id]: created }, created.id),
  }
}

// ---------------------------------------------------------------- rebase

export type RebaseResult =
  | { ok: true; kind: 'up-to-date'; local: LocalRepo }
  | {
      ok: true
      kind: 'fast-forward' | 'rebased'
      local: LocalRepo
      from: CommitId
      to: CommitId
      /** The replayed commits, oldest first, with their new ids. */
      replayed: Commit[]
    }
  | { ok: false; kind: 'unstaged-changes' | 'staged-changes' }
  | { ok: false; kind: 'conflict'; commit: Commit; conflicts: ConflictedFile[] }

/** Commits on `tip` but not on `upstream`, oldest first. Merge commits are dropped, as Git does. */
export function commitsToReplay(commits: CommitMap, upstream: CommitId, tip: CommitId): Commit[] {
  const onUpstream = reachable(commits, upstream)
  return log(commits, tip)
    .filter((commit) => !onUpstream.has(commit.id) && commit.parents.length < 2)
    .reverse()
}

/**
 * Replays `toReplay` on top of `onto`, each one 3-way merged so it keeps whatever `onto` changed
 * elsewhere in the same files. Stops at the first commit that conflicts.
 */
export function replay(
  commits: CommitMap,
  toReplay: Commit[],
  onto: CommitId,
  timestamp?: number
):
  | { ok: true; commits: Commit[]; tip: CommitId }
  | { ok: false; commit: Commit; conflicts: ConflictedFile[] } {
  let parent = onto
  let tree = commits[onto].tree
  const replayed: Commit[] = []
  for (const commit of toReplay) {
    const before = commit.parents[0] ? commits[commit.parents[0]].tree : {}
    const merged = mergeTrees(before, tree, commit.tree)
    if (!merged.ok) return { ok: false, commit, conflicts: merged.conflicts }
    const rebased = makeCommit({
      ...commit,
      parents: [parent],
      tree: merged.tree,
      timestamp: timestamp ?? commit.timestamp,
    })
    replayed.push(rebased)
    parent = rebased.id
    tree = merged.tree
  }
  return { ok: true, commits: replayed, tip: parent }
}

/**
 * `git rebase <upstream>`: replays the branch's own commits on top of `upstream`, giving them new
 * ids. Needs a clean working tree, like Git. On a conflict nothing changes (no half-done rebase).
 */
export function rebase(
  local: LocalRepo,
  upstream: CommitId,
  options: { timestamp?: number } = {}
): RebaseResult {
  const { staged, unstaged } = dirtyPaths(local)
  if (unstaged.length > 0) return { ok: false, kind: 'unstaged-changes' }
  if (staged.length > 0) return { ok: false, kind: 'staged-changes' }

  const from = headId(local)
  if (isAncestor(local.commits, upstream, from)) return { ok: true, kind: 'up-to-date', local }

  if (isAncestor(local.commits, from, upstream)) {
    return {
      ok: true,
      kind: 'fast-forward',
      from,
      to: upstream,
      replayed: [],
      local: moveBranch(local, local.commits, upstream),
    }
  }

  const result = replay(
    local.commits,
    commitsToReplay(local.commits, upstream, from),
    upstream,
    options.timestamp
  )
  if (!result.ok)
    return { ok: false, kind: 'conflict', commit: result.commit, conflicts: result.conflicts }

  const commits = { ...local.commits }
  for (const commit of result.commits) commits[commit.id] = commit
  return {
    ok: true,
    kind: 'rebased',
    from,
    to: result.tip,
    replayed: result.commits,
    local: moveBranch(local, commits, result.tip),
  }
}
