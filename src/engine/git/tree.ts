import type { Change, FileTree } from './types'

/** Git orders paths bytewise; for the ASCII paths in this game that's plain string order. */
export function sortPaths(paths: Iterable<string>): string[] {
  return [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export function diffTrees(from: FileTree, to: FileTree): Change[] {
  const paths = sortPaths(new Set([...Object.keys(from), ...Object.keys(to)]))
  const changes: Change[] = []
  for (const path of paths) {
    const before = from[path]
    const after = to[path]
    if (before === after) continue
    if (before === undefined) changes.push({ path, kind: 'new' })
    else if (after === undefined) changes.push({ path, kind: 'deleted' })
    else changes.push({ path, kind: 'modified' })
  }
  return changes
}

/** Does a pathspec (`.`, `team.md`, `docs`, `docs/`, `./team.md`) cover this path? */
export function pathspecMatches(spec: string, path: string): boolean {
  const normalized = normalizePathspec(spec)
  return normalized === '' || path === normalized || path.startsWith(`${normalized}/`)
}

export function normalizePathspec(spec: string): string {
  let normalized = spec.trim()
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  if (normalized === '.') return ''
  return normalized.replace(/\/+$/, '')
}
