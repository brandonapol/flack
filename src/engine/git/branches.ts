import { diffTrees } from './tree'
import { headId, headTree, isAncestor } from './repo'
import type { CommitId, FileTree, LocalRepo } from './types'

/**
 * Real Git's rules, simplified: no spaces or special characters, no `..`, can't start with `-`
 * or end with `/`, `.` or `.lock`.
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name === '@' || name === 'HEAD') return false
  if (/[\s~^:?*[\\]/.test(name)) return false
  if (name.includes('..') || name.includes('//') || name.includes('@{')) return false
  if (name.startsWith('-') || name.startsWith('/') || name.startsWith('.')) return false
  if (name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false
  return !name.split('/').some((part) => part.startsWith('.'))
}

export type MoveResult =
  { ok: true; index: FileTree; working: FileTree } | { ok: false; paths: string[] }

/**
 * Updates the index and working files for a move from the current commit to `to`, carrying
 * uncommitted edits along. Refuses (listing the files) if an edit touches a file that differs
 * between the two commits.
 */
export function moveWorkingTree(local: LocalRepo, to: CommitId): MoveResult {
  const before = headTree(local)
  const after = local.commits[to].tree
  const changed = diffTrees(before, after).map((change) => change.path)
  const dirty = changed.filter(
    (path) => local.index[path] !== before[path] || local.working[path] !== before[path]
  )
  if (dirty.length > 0) return { ok: false, paths: dirty }

  const apply = (tree: FileTree) => {
    const next = { ...tree }
    for (const path of changed) {
      if (path in after) next[path] = after[path]
      else delete next[path]
    }
    return next
  }
  return { ok: true, index: apply(local.index), working: apply(local.working) }
}

export type SwitchResult =
  | {
      ok: true
      local: LocalRepo
      kind: 'created' | 'switched' | 'already-on'
      /** Set when a local branch was created to track `origin/<branch>`. */
      tracking?: string
    }
  | { ok: false; kind: 'exists' | 'invalid-name' | 'invalid-reference'; branch: string }
  | { ok: false; kind: 'would-overwrite'; branch: string; paths: string[] }

/** `git switch <branch>` and `git switch -c <branch> [<start>]`. */
export function switchBranch(
  local: LocalRepo,
  branch: string,
  options: { create?: boolean; startPoint?: CommitId } = {}
): SwitchResult {
  if (options.create) {
    if (!isValidBranchName(branch)) return { ok: false, kind: 'invalid-name', branch }
    if (branch in local.branches) return { ok: false, kind: 'exists', branch }
    const start = options.startPoint ?? headId(local)
    const moved = moveWorkingTree(local, start)
    if (!moved.ok) return { ok: false, kind: 'would-overwrite', branch, paths: moved.paths }
    return {
      ok: true,
      kind: 'created',
      local: {
        ...local,
        ...moved,
        head: branch,
        branches: { ...local.branches, [branch]: start },
      },
    }
  }

  if (branch === local.head) return { ok: true, kind: 'already-on', local }

  let target = local.branches[branch]
  let tracking: string | undefined
  if (target === undefined && local.remoteBranches[branch] !== undefined) {
    // Git's "DWIM": switching to a branch that only exists on the remote creates a tracking branch.
    target = local.remoteBranches[branch]
    tracking = branch
  }
  if (target === undefined) return { ok: false, kind: 'invalid-reference', branch }

  const moved = moveWorkingTree(local, target)
  if (!moved.ok) return { ok: false, kind: 'would-overwrite', branch, paths: moved.paths }
  return {
    ok: true,
    kind: tracking ? 'created' : 'switched',
    tracking,
    local: {
      ...local,
      ...moved,
      head: branch,
      branches: { ...local.branches, [branch]: target },
      upstreams: tracking ? { ...local.upstreams, [branch]: tracking } : local.upstreams,
    },
  }
}

export type DeleteBranchResult =
  | { ok: true; local: LocalRepo; was: CommitId }
  | { ok: false; kind: 'not-found' | 'current' | 'not-merged'; branch: string }

/**
 * `git branch -d` (or `-D` with `force`). A branch counts as merged when its tip is in the history
 * of its upstream, or of the current branch. A squash-merged branch is *not* merged by that test,
 * which is exactly the surprise real Git gives people.
 */
export function deleteBranch(local: LocalRepo, branch: string, force = false): DeleteBranchResult {
  const tip = local.branches[branch]
  if (tip === undefined) return { ok: false, kind: 'not-found', branch }
  if (branch === local.head) return { ok: false, kind: 'current', branch }
  if (!force) {
    const upstream = local.upstreams[branch]
    const upstreamTip = upstream ? local.remoteBranches[upstream] : undefined
    const base = upstreamTip ?? headId(local)
    if (!isAncestor(local.commits, tip, base)) return { ok: false, kind: 'not-merged', branch }
  }
  const branches = { ...local.branches }
  delete branches[branch]
  const upstreams = { ...local.upstreams }
  delete upstreams[branch]
  return { ok: true, was: tip, local: { ...local, branches, upstreams } }
}
