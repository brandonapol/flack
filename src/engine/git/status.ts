import { aheadBehind, headTree } from './repo'
import { diffTrees } from './tree'
import type { Change, LocalRepo } from './types'

export interface UpstreamStatus {
  /** Display name, e.g. `origin/main`. */
  name: string
  /** The remote branch no longer exists in our remote-tracking refs. */
  gone: boolean
  ahead: number
  behind: number
}

export interface Status {
  branch: string
  upstream?: UpstreamStatus
  staged: Change[]
  unstaged: Change[]
  untracked: string[]
}

export function getUpstream(local: LocalRepo, branch = local.head): UpstreamStatus | undefined {
  const remoteBranch = local.upstreams[branch]
  if (!remoteBranch) return undefined
  const name = `origin/${remoteBranch}`
  const tip = local.remoteBranches[remoteBranch]
  if (!tip) return { name, gone: true, ahead: 0, behind: 0 }
  return { name, gone: false, ...aheadBehind(local.commits, local.branches[branch], tip) }
}

export function getStatus(local: LocalRepo): Status {
  const unstaged: Change[] = []
  const untracked: string[] = []
  for (const change of diffTrees(local.index, local.working)) {
    if (change.kind === 'new') untracked.push(change.path)
    else unstaged.push(change)
  }
  return {
    branch: local.head,
    upstream: getUpstream(local),
    staged: diffTrees(headTree(local), local.index),
    unstaged,
    untracked,
  }
}

export function isClean(status: Status): boolean {
  return status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0
}
