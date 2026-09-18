import type { GameEvent } from '../../engine/events'
import type { GameState } from '../../engine/game'
import { clone } from '../../engine/git/repo'
import { getStatus } from '../../engine/git/status'
import { DOCS_SITE } from '../world'

/** Did the learner just run this command successfully? */
export function ran(event: GameEvent, name: string, sub?: string): boolean {
  return (
    event.type === 'command' &&
    event.ok &&
    event.name === name &&
    (sub === undefined || event.argv[1] === sub)
  )
}

/** Did they run it at all, even if Git complained? */
export function tried(event: GameEvent, name: string, sub?: string): boolean {
  return (
    event.type === 'command' && event.name === name && (sub === undefined || event.argv[1] === sub)
  )
}

export function local(state: GameState) {
  return state.git.local
}

export function docsSite(state: GameState) {
  return state.git.remotes[DOCS_SITE]
}

/** For a chapter jumped to directly (`?chapter=`): a fresh clone to work in, if there isn't one. */
export function withClone(state: GameState): GameState {
  if (state.git.local) return state
  const repo = clone(docsSite(state))
  return {
    ...state,
    git: { ...state.git, local: repo },
    shell: { ...state.shell, cwd: `/Users/you/${repo.dir}` },
  }
}

export function working(state: GameState, path: string): string | undefined {
  return state.git.local?.working[path]
}

export function staged(state: GameState, path: string): boolean {
  const repo = state.git.local
  return repo ? getStatus(repo).staged.some((change) => change.path === path) : false
}

/** Lines added to a file since the last commit, ignoring blank ones. */
export function addedLines(state: GameState, path: string): string[] {
  const repo = state.git.local
  if (!repo) return []
  const before = repo.commits[repo.branches[repo.head]].tree[path] ?? ''
  const after = repo.working[path] ?? ''
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const remaining = [...beforeLines]
  const added: string[] = []
  for (const line of afterLines) {
    const index = remaining.indexOf(line)
    if (index === -1) added.push(line)
    else remaining.splice(index, 1)
  }
  return added.filter((line) => line.trim() !== '')
}

/** Everything that was in the file before is still there. */
export function keptExistingLines(state: GameState, path: string): boolean {
  const repo = state.git.local
  if (!repo) return false
  const before = repo.commits[repo.branches[repo.head]].tree[path] ?? ''
  const after = repo.working[path] ?? ''
  return before
    .split('\n')
    .filter((line) => line.trim() !== '')
    .every((line) => after.includes(line))
}

/** The name someone typed as a new bullet: `- Ada Lovelace` → `Ada Lovelace`. */
export function nameFromBullet(line: string): string {
  return line.replace(/^\s*[-*]\s*/, '').trim()
}
