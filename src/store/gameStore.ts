import { createStore, type StoreApi } from 'zustand/vanilla'

import {
  blankState,
  initialState,
  reduce,
  startChapter,
  type Action,
  type GameState,
  type ReduceResult,
} from '../engine/game'
import type { Effect, GameConfig } from '../engine/story/types'
import {
  browserStorage,
  clearSave,
  loadSave,
  writeSave,
  type ScheduledEffect,
  type StorageLike,
} from './persistence'

/** How long before a delayed Flack message arrives the "typing…" indicator appears. */
export const TYPING_LEAD_MS = 2000
export const SAVE_DEBOUNCE_MS = 300

export interface Typing {
  channel: string
  from: string
}

export interface GameStoreState {
  /** Content and commands. Never changes; here so panels can look up chapters and steps. */
  config: GameConfig
  game: GameState
  /** Effects waiting to fire. Saved with the game, so a reload doesn't lose them. */
  scheduled: ScheduledEffect[]
  /** Characters currently "typing", derived from scheduled Flack messages. */
  typing: Typing[]
  debug: boolean
  /** Set when an unusable save was thrown away at startup, so the UI can say so. */
  notice?: 'save-discarded'
  dispatch: (action: Action) => void
  restartChapter: () => void
  resetEverything: () => void
  dismissNotice: () => void
}

export interface Timers {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface GameStoreOptions {
  config: GameConfig
  storage?: StorageLike
  timers?: Timers
  /** `location.search`, for `?chapter=` and `?debug=1`. */
  search?: string
}

export type GameStore = StoreApi<GameStoreState>

const browserTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function isTyping(effect: Effect): effect is Extract<Effect, { type: 'flackMessage' }> {
  return effect.type === 'flackMessage' && effect.from !== 'player'
}

export function createGameStore(options: GameStoreOptions): GameStore {
  const { config } = options
  const storage = options.storage ?? browserStorage()
  const timers = options.timers ?? browserTimers
  const params = new URLSearchParams(options.search ?? '')
  const handles = new Map<string, unknown[]>()
  let saveHandle: unknown
  let nextId = 1

  const store = createStore<GameStoreState>()(() => ({
    config,
    game: blankState(config),
    scheduled: [],
    typing: [],
    debug: params.get('debug') === '1',
    dispatch: () => undefined,
    restartChapter: () => undefined,
    resetEverything: () => undefined,
    dismissNotice: () => undefined,
  }))

  const persistSoon = () => {
    if (saveHandle !== undefined) timers.clearTimeout(saveHandle)
    saveHandle = timers.setTimeout(() => {
      saveHandle = undefined
      const { game, scheduled } = store.getState()
      writeSave(storage, game, scheduled)
    }, SAVE_DEBOUNCE_MS)
  }

  const cancelAll = () => {
    handles.forEach((list) => list.forEach((handle) => timers.clearTimeout(handle)))
    handles.clear()
    store.setState({ scheduled: [], typing: [] })
  }

  const arm = (entry: ScheduledEffect) => {
    const remaining = Math.max(0, entry.dueAt - timers.now())
    const list: unknown[] = []
    const { effect } = entry
    if (isTyping(effect)) {
      list.push(
        timers.setTimeout(
          () => {
            store.setState((s) => ({
              typing: [...s.typing, { channel: effect.channel, from: effect.from }],
            }))
          },
          Math.max(0, remaining - TYPING_LEAD_MS)
        )
      )
    }
    list.push(timers.setTimeout(() => fire(entry), remaining))
    handles.set(entry.id, list)
  }

  const schedule = (effects: Effect[]) => {
    if (effects.length === 0) return
    const entries = effects.map((effect) => ({
      id: `fx-${nextId++}`,
      effect,
      dueAt: timers.now() + (effect.delayMs ?? 0),
    }))
    store.setState((s) => ({ scheduled: [...s.scheduled, ...entries] }))
    entries.forEach(arm)
  }

  const commit = (result: ReduceResult) => {
    store.setState({ game: result.state })
    schedule(result.effects)
    persistSoon()
  }

  function fire(entry: ScheduledEffect) {
    handles.delete(entry.id)
    const { effect } = entry
    store.setState((s) => ({
      scheduled: s.scheduled.filter((candidate) => candidate.id !== entry.id),
      typing: isTyping(effect)
        ? removeOne(s.typing, (t) => t.channel === effect.channel && t.from === effect.from)
        : s.typing,
    }))
    commit(reduce(config, store.getState().game, { type: 'applyEffect', effect }))
  }

  const dispatch = (action: Action) => {
    if (action.type === 'restartChapter' || action.type === 'startChapter') cancelAll()
    commit(reduce(config, store.getState().game, action))
  }

  const resetEverything = () => {
    cancelAll()
    if (saveHandle !== undefined) timers.clearTimeout(saveHandle)
    saveHandle = undefined
    clearSave(storage)
    commit(initialState(config))
  }

  store.setState({
    dispatch,
    restartChapter: () => dispatch({ type: 'restartChapter' }),
    resetEverything,
    dismissNotice: () => store.setState({ notice: undefined }),
  })

  // Starting point: an explicit ?chapter= jump, then a save, then a new game.
  const jump = params.get('chapter')
  const jumpTo = jump
    ? config.chapters.find((chapter) => chapter.id === jump || chapter.id.startsWith(`${jump}-`))
    : undefined
  if (jumpTo) {
    commit(startChapter(config, blankState(config), jumpTo.id))
  } else {
    const loaded = loadSave(storage)
    if (loaded.kind === 'loaded') {
      store.setState({ game: loaded.save.game, scheduled: loaded.save.scheduled })
      nextId =
        Math.max(0, ...loaded.save.scheduled.map((entry) => Number(entry.id.slice(3)) || 0)) + 1
      loaded.save.scheduled.forEach(arm)
    } else {
      if (loaded.kind === 'discarded') store.setState({ notice: 'save-discarded' })
      commit(initialState(config))
    }
  }

  return store
}

function removeOne<T>(items: T[], match: (item: T) => boolean): T[] {
  const index = items.findIndex(match)
  return index === -1 ? items : [...items.slice(0, index), ...items.slice(index + 1)]
}
