import { GAME_STATE_VERSION, type GameState } from '../engine/game'
import type { Effect } from '../engine/story/types'

export const STORAGE_KEY = 'flack:v1'
export const MAX_SAVED_OUTPUT = 500

export interface ScheduledEffect {
  id: string
  effect: Effect
  /** Wall-clock milliseconds when it should fire. */
  dueAt: number
}

export interface SaveFile {
  version: number
  game: GameState
  scheduled: ScheduledEffect[]
}

/** The subset of the Web Storage API we use, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadResult =
  | { kind: 'loaded'; save: SaveFile }
  | { kind: 'empty' }
  /** A save exists but can't be used (corrupt, or from an incompatible version). */
  | { kind: 'discarded' }

/**
 * Upgrades an older save to the current shape. There's only one version so far; when the shape
 * of GameState changes, bump GAME_STATE_VERSION and add a step here, or return undefined to reset.
 */
export function migrate(save: { version: number } & Record<string, unknown>): SaveFile | undefined {
  if (save.version === GAME_STATE_VERSION) return save as unknown as SaveFile
  return undefined
}

export function loadSave(storage: StorageLike | undefined): LoadResult {
  if (!storage) return { kind: 'empty' }
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { kind: 'empty' }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as SaveFile).version !== 'number') {
      return { kind: 'discarded' }
    }
    const save = migrate(parsed as SaveFile & Record<string, unknown>)
    return save ? { kind: 'loaded', save } : { kind: 'discarded' }
  } catch {
    return { kind: 'discarded' }
  }
}

function capOutput(game: GameState): GameState {
  if (game.shell.output.length <= MAX_SAVED_OUTPUT) return game
  return { ...game, shell: { ...game.shell, output: game.shell.output.slice(-MAX_SAVED_OUTPUT) } }
}

/** Returns false if the write failed (quota, privacy mode); the game carries on either way. */
export function writeSave(
  storage: StorageLike | undefined,
  game: GameState,
  scheduled: ScheduledEffect[]
): boolean {
  if (!storage) return false
  try {
    const save: SaveFile = { version: GAME_STATE_VERSION, game: capOutput(game), scheduled }
    storage.setItem(STORAGE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

export function clearSave(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: the next write will overwrite whatever is there.
  }
}

/** `window.localStorage`, or undefined when even touching it throws. */
export function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}
