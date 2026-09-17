import { getUpstream } from '../git/status'
import type { CoreState } from '../state'
import { currentDir, displayPath, repoPath } from './fs'

/** `~ $`, `~/docs-site (main) $`, `~/docs-site/docs (add-my-name ↑1) $` */
export function promptFor(state: CoreState): string {
  const cwd = currentDir(state)
  const where = displayPath(cwd)
  const local = state.git.local
  if (!local || repoPath(state, cwd) === undefined) return `${where} $`

  const upstream = getUpstream(local)
  let marks = ''
  if (upstream && !upstream.gone) {
    if (upstream.ahead > 0) marks += ` ↑${upstream.ahead}`
    if (upstream.behind > 0) marks += ` ↓${upstream.behind}`
  }
  return `${where} (${local.head}${marks}) $`
}
