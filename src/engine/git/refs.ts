import { resolveCommitId } from './repo'
import type { CommitId, LocalRepo } from './types'

/**
 * Resolves what people type where Git expects a commit: `HEAD`, `HEAD~2`, `HEAD^`, a branch,
 * `origin/<branch>`, `origin`, or a (short) commit id.
 */
export function resolveRef(local: LocalRepo, ref: string): CommitId | undefined {
  const match = /^(.*?)((?:[~^]\d*)*)$/.exec(ref)
  if (!match) return undefined
  const [, base, suffix] = match
  let id = resolveBase(local, base)
  if (!id) return undefined

  for (const step of suffix.match(/[~^]\d*/g) ?? []) {
    const count = step.length > 1 ? Number(step.slice(1)) : 1
    if (step.startsWith('~')) {
      for (let i = 0; i < count && id; i++) id = local.commits[id]?.parents[0]
    } else {
      id = count === 0 ? id : local.commits[id]?.parents[count - 1]
    }
    if (!id) return undefined
  }
  return id
}

function resolveBase(local: LocalRepo, base: string): CommitId | undefined {
  if (base === 'HEAD' || base === '@') return local.branches[local.head]
  if (base in local.branches) return local.branches[base]
  if (base === 'origin' || base === 'origin/HEAD') return local.remoteBranches[local.remoteHead]
  if (base.startsWith('origin/')) return local.remoteBranches[base.slice('origin/'.length)]
  if (base.startsWith('refs/heads/')) return local.branches[base.slice('refs/heads/'.length)]
  return resolveCommitId(local.commits, base)
}
