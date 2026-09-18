import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toyConfig } from '../engine/story/__fixtures__/toyChapter'
import {
  createGameStore,
  FAST_DELAY_FACTOR,
  SAVE_DEBOUNCE_MS,
  TYPING_LEAD_MS,
  type Timers,
} from './gameStore'
import { MAX_SAVED_OUTPUT, STORAGE_KEY, type StorageLike } from './persistence'

const config = toyConfig()

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

const timers: Timers = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** Plays the toy chapter up to the step whose completion schedules Sam's delayed message. */
function playToSave(store: ReturnType<typeof createGameStore>) {
  const { dispatch } = store.getState()
  dispatch({ type: 'runCommand', line: 'echo hello' })
  dispatch({ type: 'saveFile', path: 'team.md', content: '# Docs team\n\n- Ada\n' })
}

const hasSamMessage = (store: ReturnType<typeof createGameStore>) =>
  store.getState().game.flack.messages.some((m) => m.id === 'sam-hi')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('game store', () => {
  it('starts a new game at the first step', () => {
    const store = createGameStore({ config, storage: memoryStorage(), timers })
    expect(store.getState().game.story).toMatchObject({ chapterId: 'toy', stepIndex: 0 })
    expect(store.getState().game.flack.messages.map((m) => m.id)).toEqual(['welcome'])
  })

  it('fires a delayed effect after its delay, with a typing indicator first', () => {
    const store = createGameStore({ config, storage: memoryStorage(), timers })
    playToSave(store)
    expect(store.getState().scheduled).toHaveLength(1)
    expect(hasSamMessage(store)).toBe(false)
    expect(store.getState().typing).toEqual([])

    vi.advanceTimersByTime(3000 - TYPING_LEAD_MS)
    expect(store.getState().typing).toEqual([{ channel: 'docs-team', from: 'sam' }])

    vi.advanceTimersByTime(TYPING_LEAD_MS)
    expect(hasSamMessage(store)).toBe(true)
    expect(store.getState().typing).toEqual([])
    expect(store.getState().scheduled).toEqual([])
  })

  it('saves (debounced) and a reload mid-delay still delivers the effect', () => {
    const storage = memoryStorage()
    const first = createGameStore({ config, storage, timers })
    playToSave(first)
    expect(storage.data.has(STORAGE_KEY)).toBe(false)
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(storage.data.has(STORAGE_KEY)).toBe(true)

    vi.advanceTimersByTime(1000)
    // The page reloads. (The old store's timers keep running here, but only touch the old store.)
    const second = createGameStore({ config, storage, timers })
    expect(second.getState().game.story.stepIndex).toBe(3)
    expect(hasSamMessage(second)).toBe(false)

    // Due at 3000ms; 1300ms have passed.
    vi.advanceTimersByTime(1699)
    expect(hasSamMessage(second)).toBe(false)
    vi.advanceTimersByTime(1)
    expect(hasSamMessage(second)).toBe(true)
  })

  it('flushSave writes a pending save straight away, so a quick reload loses nothing', () => {
    const storage = memoryStorage()
    const first = createGameStore({ config, storage, timers })
    playToSave(first)
    expect(storage.data.has(STORAGE_KEY)).toBe(false)
    first.getState().flushSave()
    expect(createGameStore({ config, storage, timers }).getState().game.story.stepIndex).toBe(3)
  })

  it('an effect that came due while the page was closed fires right away', () => {
    const storage = memoryStorage()
    playToSave(createGameStore({ config, storage, timers }))
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    vi.setSystemTime(Date.now() + 60_000)
    const reopened = createGameStore({ config, storage, timers })
    vi.advanceTimersByTime(0)
    expect(hasSamMessage(reopened)).toBe(true)
  })

  it('keeps working when storage throws', () => {
    const store = createGameStore({ config, storage: brokenStorage, timers })
    playToSave(store)
    vi.advanceTimersByTime(5000)
    expect(hasSamMessage(store)).toBe(true)
    expect(() => store.getState().resetEverything()).not.toThrow()
  })

  it('discards a corrupt or incompatible save with a notice', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, '{"version": 999}')
    const store = createGameStore({ config, storage, timers })
    expect(store.getState().notice).toBe('save-discarded')
    expect(store.getState().game.story.chapterId).toBe('toy')
    store.getState().dismissNotice()
    expect(store.getState().notice).toBeUndefined()

    storage.setItem(STORAGE_KEY, 'not json')
    expect(createGameStore({ config, storage, timers }).getState().notice).toBe('save-discarded')
  })

  it('reset everything clears storage, pending effects and progress', () => {
    const storage = memoryStorage()
    const store = createGameStore({ config, storage, timers })
    playToSave(store)
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    store.getState().resetEverything()
    expect(storage.data.has(STORAGE_KEY)).toBe(false)
    expect(store.getState().scheduled).toEqual([])
    expect(store.getState().game.story.stepIndex).toBe(0)

    vi.advanceTimersByTime(10_000)
    expect(hasSamMessage(store)).toBe(false)
  })

  it('restart chapter cancels pending effects', () => {
    const store = createGameStore({ config, storage: memoryStorage(), timers })
    playToSave(store)
    store.getState().restartChapter()
    vi.advanceTimersByTime(10_000)
    expect(hasSamMessage(store)).toBe(false)
    expect(store.getState().game.story.stepIndex).toBe(0)
  })

  it('caps terminal output in the save', () => {
    const storage = memoryStorage()
    const store = createGameStore({ config, storage, timers })
    for (let i = 0; i < MAX_SAVED_OUTPUT; i++) {
      store.getState().dispatch({ type: 'runCommand', line: `echo ${i}` })
    }
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!)
    expect(saved.game.shell.output).toHaveLength(MAX_SAVED_OUTPUT)
    expect(saved.game.shell.output.at(-1).text).toBe(`${MAX_SAVED_OUTPUT - 1}`)
  })

  it('?fast=1 shrinks delays but keeps them in order', () => {
    const store = createGameStore({ config, storage: memoryStorage(), timers, search: '?fast=1' })
    playToSave(store)
    expect(hasSamMessage(store)).toBe(false)
    vi.advanceTimersByTime(3000 * FAST_DELAY_FACTOR)
    expect(hasSamMessage(store)).toBe(true)
  })

  it('?chapter= jumps straight to a chapter and ?debug=1 sets the flag', () => {
    const storage = memoryStorage()
    const store = createGameStore({ config, storage, timers, search: '?chapter=epilogue&debug=1' })
    expect(store.getState().game.story.chapterId).toBe('epilogue')
    expect(store.getState().debug).toBe(true)
  })
})
