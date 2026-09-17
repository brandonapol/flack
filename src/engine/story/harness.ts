import { blankState, reduce, startChapter, type Action, type GameState } from '../game'
import type { TerminalLine } from '../lines'
import type { Effect, GameConfig } from './types'

export interface PlayResult {
  state: GameState
  /** Ids of steps completed in this chapter, in order. */
  trace: string[]
  /** Terminal lines added while playing. */
  output: TerminalLine[]
}

/** Applies every pending effect at once (and any they schedule), ignoring delays. */
export function flushEffects(config: GameConfig, state: GameState, pending: Effect[]): GameState {
  let current = state
  const queue = [...pending]
  let guard = 0
  while (queue.length > 0) {
    if (++guard > 500) throw new Error('flushEffects: effects keep scheduling more effects')
    const effect = queue.shift()!
    const result = reduce(config, current, { type: 'applyEffect', effect })
    current = result.state
    queue.push(...result.effects)
  }
  return current
}

/** Runs actions one after another, flushing delayed effects after each, like a very fast player. */
export function play(config: GameConfig, state: GameState, actions: Action[]): GameState {
  let current = state
  for (const action of actions) {
    const result = reduce(config, current, action)
    current = flushEffects(config, result.state, result.effects)
  }
  return current
}

/**
 * The golden-path harness: start `chapterId` (from `from`, or a blank game), play `actions`, and
 * report which steps completed. Every chapter ships with a test built on this.
 */
export function playChapter(
  config: GameConfig,
  chapterId: string,
  actions: Action[],
  options: { from?: GameState } = {}
): PlayResult {
  const started = startChapter(config, options.from ?? blankState(config), chapterId)
  const initial = flushEffects(config, started.state, started.effects)
  const outputBefore = initial.shell.output.length
  const state = play(config, initial, actions)
  return {
    state,
    trace: state.story.completedSteps,
    output: state.shell.output.slice(outputBefore),
  }
}
