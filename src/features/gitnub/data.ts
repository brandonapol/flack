import { log } from '../../engine/git/repo'
import type { Commit, FileTree, RemoteRepo } from '../../engine/git/types'
import { shortDate } from '../shared/time'

export interface DirEntry {
  name: string
  path: string
  type: 'dir' | 'file'
}

/** Folders first, then files, alphabetical: GitNub's listing order. */
export function listDirectory(tree: FileTree, dir: string): DirEntry[] | undefined {
  const prefix = dir ? `${dir}/` : ''
  const entries = new Map<string, DirEntry>()
  for (const path of Object.keys(tree)) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    const slash = rest.indexOf('/')
    const name = slash === -1 ? rest : rest.slice(0, slash)
    entries.set(name, { name, path: prefix + name, type: slash === -1 ? 'file' : 'dir' })
  }
  if (dir && entries.size === 0) return undefined
  return [...entries.values()].sort((a, b) =>
    a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)
  )
}

/** The newest commit on `branch` that changed `path` (a file, or anything inside a folder). */
export function lastCommitTouching(
  remote: RemoteRepo,
  branch: string,
  path: string
): Commit | undefined {
  const matches = (tree: FileTree, other: FileTree) =>
    Object.keys({ ...tree, ...other }).some(
      (candidate) =>
        (candidate === path || candidate.startsWith(`${path}/`)) &&
        tree[candidate] !== other[candidate]
    )
  for (const commit of log(remote.commits, remote.branches[branch])) {
    const parent = commit.parents[0] ? remote.commits[commit.parents[0]].tree : {}
    if (matches(commit.tree, parent)) return commit
  }
  return undefined
}

export function commitsByDay(commits: Commit[]): Array<{ day: string; commits: Commit[] }> {
  const groups: Array<{ day: string; commits: Commit[] }> = []
  for (const commit of commits) {
    const day = shortDate(commit.timestamp)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.commits.push(commit)
    else groups.push({ day, commits: [commit] })
  }
  return groups
}

export function subjectOf(message: string): string {
  return message.split('\n')[0]
}

export function repoPath(slug: string, ...rest: string[]): string {
  return ['/gitnub', slug, ...rest].filter(Boolean).join('/')
}
