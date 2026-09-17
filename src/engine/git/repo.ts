import { fakeHash } from './hash'
import { diffTrees, pathspecMatches, sortPaths } from './tree'
import type {
  Commit,
  CommitId,
  CommitMap,
  FileTree,
  GitConfig,
  LocalRepo,
  Person,
  RemoteRepo,
} from './types'

export const GITNUB_HOST = 'https://gitnub.com'

export function remoteUrl(slug: string): string {
  return `${GITNUB_HOST}/${slug}.git`
}

export interface CommitInput {
  parents: CommitId[]
  message: string
  author: Person
  timestamp: number
  tree: FileTree
}

export function makeCommit(input: CommitInput): Commit {
  const treeEntries = sortPaths(Object.keys(input.tree)).map((path) => [path, input.tree[path]])
  const id = fakeHash(
    JSON.stringify([
      input.parents,
      input.message,
      input.author.name,
      input.author.email,
      input.timestamp,
      treeEntries,
    ])
  )
  return { id, ...input, tree: { ...input.tree } }
}

export interface HistoryEntry {
  message: string
  author: Person
  timestamp: number
  /** The whole tree after this commit. */
  tree: FileTree
}

export interface CreateRemoteInput {
  slug: string
  description?: string
  archived?: boolean
  /** Oldest first. Becomes a straight line of commits on `main`. */
  history: HistoryEntry[]
}

export function createRemote(input: CreateRemoteInput): RemoteRepo {
  const commits: CommitMap = {}
  let tip: CommitId | undefined
  for (const entry of input.history) {
    const commit = makeCommit({ ...entry, parents: tip ? [tip] : [] })
    commits[commit.id] = commit
    tip = commit.id
  }
  if (!tip) throw new Error(`createRemote(${input.slug}): history must have at least one commit`)
  return {
    slug: input.slug,
    description: input.description ?? '',
    archived: input.archived ?? false,
    commits,
    branches: { main: tip },
    defaultBranch: 'main',
  }
}

export function repoDirName(slug: string): string {
  return slug.split('/').pop() ?? slug
}

export function clone(remote: RemoteRepo): LocalRepo {
  const tip = remote.branches[remote.defaultBranch]
  const tree = remote.commits[tip].tree
  return {
    slug: remote.slug,
    dir: repoDirName(remote.slug),
    commits: { ...remote.commits },
    head: remote.defaultBranch,
    branches: { [remote.defaultBranch]: tip },
    upstreams: { [remote.defaultBranch]: remote.defaultBranch },
    remoteBranches: { ...remote.branches },
    remoteHead: remote.defaultBranch,
    index: { ...tree },
    working: { ...tree },
  }
}

export function headId(local: LocalRepo): CommitId {
  return local.branches[local.head]
}

export function headCommit(local: LocalRepo): Commit {
  return local.commits[headId(local)]
}

export function headTree(local: LocalRepo): FileTree {
  return headCommit(local).tree
}

export type PathspecResult =
  | { ok: true; local: LocalRepo; paths: string[] }
  | { ok: false; error: { kind: 'pathspec'; path: string } }

function matchPaths(specs: string[], candidates: Iterable<string>): PathspecResult | string[] {
  const all = sortPaths(new Set(candidates))
  const matched = new Set<string>()
  for (const spec of specs) {
    const hits = all.filter((path) => pathspecMatches(spec, path))
    if (hits.length === 0) return { ok: false, error: { kind: 'pathspec', path: spec } }
    hits.forEach((path) => matched.add(path))
  }
  return sortPaths(matched)
}

/** `git add <pathspec>...` — copies working files (including deletions) into the index. */
export function stage(local: LocalRepo, specs: string[]): PathspecResult {
  const matched = matchPaths(specs, [...Object.keys(local.working), ...Object.keys(local.index)])
  if (!Array.isArray(matched)) return matched
  const index = { ...local.index }
  for (const path of matched) {
    if (path in local.working) index[path] = local.working[path]
    else delete index[path]
  }
  return { ok: true, local: { ...local, index }, paths: matched }
}

/** `git restore --staged <pathspec>...` — resets index entries back to the last commit. */
export function unstage(local: LocalRepo, specs: string[]): PathspecResult {
  const tree = headTree(local)
  const matched = matchPaths(specs, [...Object.keys(local.index), ...Object.keys(tree)])
  if (!Array.isArray(matched)) return matched
  const index = { ...local.index }
  for (const path of matched) {
    if (path in tree) index[path] = tree[path]
    else delete index[path]
  }
  return { ok: true, local: { ...local, index }, paths: matched }
}

/** `git restore <pathspec>...` — throws away unstaged edits to tracked files. */
export function discard(local: LocalRepo, specs: string[]): PathspecResult {
  const matched = matchPaths(specs, Object.keys(local.index))
  if (!Array.isArray(matched)) return matched
  const working = { ...local.working }
  for (const path of matched) working[path] = local.index[path]
  return { ok: true, local: { ...local, working }, paths: matched }
}

export type CommitError = 'identity-unknown' | 'empty-message' | 'nothing-to-commit'

export type CommitResult =
  { ok: true; local: LocalRepo; commit: Commit } | { ok: false; error: CommitError }

export function hasIdentity(config: GitConfig): boolean {
  return Boolean(config.userName?.trim() && config.userEmail?.trim())
}

/** Checks run in the same order as real Git: identity first, then the message, then the index. */
export function commit(
  local: LocalRepo,
  options: { message: string; config: GitConfig; timestamp: number }
): CommitResult {
  if (!hasIdentity(options.config)) return { ok: false, error: 'identity-unknown' }
  if (!options.message.trim()) return { ok: false, error: 'empty-message' }
  if (diffTrees(headTree(local), local.index).length === 0) {
    return { ok: false, error: 'nothing-to-commit' }
  }
  const created = makeCommit({
    parents: [headId(local)],
    message: options.message.trim(),
    author: { name: options.config.userName!.trim(), email: options.config.userEmail!.trim() },
    timestamp: options.timestamp,
    tree: local.index,
  })
  return {
    ok: true,
    commit: created,
    local: {
      ...local,
      commits: { ...local.commits, [created.id]: created },
      branches: { ...local.branches, [local.head]: created.id },
    },
  }
}

export function reachable(commits: CommitMap, from: CommitId | CommitId[]): Set<CommitId> {
  const seen = new Set<CommitId>()
  const stack = Array.isArray(from) ? [...from] : [from]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id) || !commits[id]) continue
    seen.add(id)
    stack.push(...commits[id].parents)
  }
  return seen
}

/** True when `ancestor` is `descendant` or somewhere in its history. */
export function isAncestor(commits: CommitMap, ancestor: CommitId, descendant: CommitId): boolean {
  return reachable(commits, descendant).has(ancestor)
}

export function aheadBehind(
  commits: CommitMap,
  local: CommitId,
  upstream: CommitId
): { ahead: number; behind: number } {
  const mine = reachable(commits, local)
  const theirs = reachable(commits, upstream)
  let ahead = 0
  let behind = 0
  mine.forEach((id) => {
    if (!theirs.has(id)) ahead++
  })
  theirs.forEach((id) => {
    if (!mine.has(id)) behind++
  })
  return { ahead, behind }
}

/** Newest first, like `git log`: by timestamp, children before parents when times tie. */
export function log(commits: CommitMap, from: CommitId | CommitId[]): Commit[] {
  const ids = reachable(commits, from)
  const depth = new Map<CommitId, number>()
  const depthOf = (id: CommitId): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    const parents = commits[id].parents.filter((parent) => ids.has(parent))
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depthOf))
    depth.set(id, value)
    return value
  }
  return [...ids]
    .map((id) => commits[id])
    .sort((a, b) => b.timestamp - a.timestamp || depthOf(b.id) - depthOf(a.id))
}

/** Finds a commit by full or abbreviated id (at least 4 characters, like Git). */
export function resolveCommitId(commits: CommitMap, prefix: string): CommitId | undefined {
  if (prefix.length < 4 || !/^[0-9a-f]+$/i.test(prefix)) return undefined
  const matches = Object.keys(commits).filter((id) => id.startsWith(prefix.toLowerCase()))
  return matches.length === 1 ? matches[0] : undefined
}
