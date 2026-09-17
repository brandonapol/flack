/**
 * A pretend filesystem derived from state: `/Users/you` holds the clone, and folders inside the
 * repo are inferred from the paths of its working files. Nothing here is stored separately, so the
 * terminal, the editor and Git can never disagree about what exists.
 */
import { HOME, type CoreState } from '../state'

export type EntryType = 'dir' | 'file'

export interface DirEntry {
  name: string
  type: EntryType
}

export type Node =
  | { type: 'dir'; path: string; entries: DirEntry[] }
  | { type: 'file'; path: string; content: string }

/** A fake `.git` folder, so `ls -a` has something to show. Its files are read-only curiosities. */
const DOT_GIT_ENTRIES: DirEntry[] = [
  { name: 'HEAD', type: 'file' },
  { name: 'config', type: 'file' },
  { name: 'objects', type: 'dir' },
  { name: 'refs', type: 'dir' },
]

export function normalizePath(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

export function resolvePath(cwd: string, input = ''): string {
  if (input === '' || input === '~') return HOME
  if (input.startsWith('~/')) return normalizePath(`${HOME}/${input.slice(2)}`)
  if (input.startsWith('/')) return normalizePath(input)
  return normalizePath(`${cwd}/${input}`)
}

/** `/Users/you/docs-site` → `~/docs-site` */
export function displayPath(path: string): string {
  if (path === HOME) return '~'
  if (path.startsWith(`${HOME}/`)) return `~${path.slice(HOME.length)}`
  return path
}

export function repoRoot(state: CoreState): string | undefined {
  return state.git.local ? `${HOME}/${state.git.local.dir}` : undefined
}

/** The repo-relative path (`''` for the repo folder itself), or undefined outside the repo. */
export function repoPath(state: CoreState, path: string): string | undefined {
  const root = repoRoot(state)
  if (!root) return undefined
  if (path === root) return ''
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1)
  return undefined
}

function sortEntries(entries: Iterable<DirEntry>): DirEntry[] {
  return [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

function repoNode(state: CoreState, absolute: string, relative: string): Node | undefined {
  const working = state.git.local!.working

  if (relative === '.git' || relative.startsWith('.git/')) {
    const inner = relative.slice(5)
    if (relative === '.git') return { type: 'dir', path: absolute, entries: DOT_GIT_ENTRIES }
    if (inner === 'HEAD') {
      return { type: 'file', path: absolute, content: `ref: refs/heads/${state.git.local!.head}\n` }
    }
    if (inner === 'config') {
      return {
        type: 'file',
        path: absolute,
        content: `[remote "origin"]\n\turl = https://gitnub.com/${state.git.local!.slug}.git\n`,
      }
    }
    if (inner === 'objects' || inner === 'refs') return { type: 'dir', path: absolute, entries: [] }
    return undefined
  }

  if (relative in working) return { type: 'file', path: absolute, content: working[relative] }

  const prefix = relative === '' ? '' : `${relative}/`
  const entries = new Map<string, DirEntry>()
  for (const filePath of Object.keys(working)) {
    if (!filePath.startsWith(prefix)) continue
    const rest = filePath.slice(prefix.length)
    const slash = rest.indexOf('/')
    const name = slash === -1 ? rest : rest.slice(0, slash)
    entries.set(name, { name, type: slash === -1 ? 'file' : 'dir' })
  }
  if (relative !== '' && entries.size === 0) return undefined
  if (relative === '') entries.set('.git', { name: '.git', type: 'dir' })
  return { type: 'dir', path: absolute, entries: sortEntries(entries.values()) }
}

export function lookup(state: CoreState, path: string): Node | undefined {
  const absolute = normalizePath(path)
  const relative = repoPath(state, absolute)
  if (relative !== undefined) return repoNode(state, absolute, relative)

  const local = state.git.local
  if (absolute === HOME) {
    return {
      type: 'dir',
      path: absolute,
      entries: local ? [{ name: local.dir, type: 'dir' }] : [],
    }
  }
  if (absolute === '/')
    return { type: 'dir', path: absolute, entries: [{ name: 'Users', type: 'dir' }] }
  if (absolute === '/Users') {
    return { type: 'dir', path: absolute, entries: [{ name: 'you', type: 'dir' }] }
  }
  return undefined
}

/** The working directory, falling back to home if it no longer exists (e.g. after a reset). */
export function currentDir(state: CoreState): string {
  return lookup(state, state.shell.cwd)?.type === 'dir' ? state.shell.cwd : HOME
}

export type ChangeDirResult = { ok: true; cwd: string } | { ok: false; message: string }

/** `cd` semantics, with zsh's error wording. */
export function changeDirectory(state: CoreState, input?: string): ChangeDirResult {
  const target = resolvePath(currentDir(state), input)
  const node = lookup(state, target)
  if (!node) return { ok: false, message: `cd: no such file or directory: ${input}` }
  if (node.type === 'file') return { ok: false, message: `cd: not a directory: ${input}` }
  return { ok: true, cwd: target }
}
