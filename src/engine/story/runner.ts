import type { GameEvent } from '../events'
import type { GameState, ReduceResult } from '../game'
import { applyEffect } from './effects'
import type { Chapter, Effect, GameConfig, Step } from './types'

/** Commands that are about getting help or tidying up, so they never count as a miss. */
const NEUTRAL_COMMANDS = new Set(['help', 'hint', 'clear', 'history'])

/** After this many misses, the Hint button pulses. */
export const PULSE_AFTER_MISSES = 2
/** After this many misses, the first hint appears on its own. */
export const AUTO_HINT_AFTER_MISSES = 4

const MAX_EVENTS = 500

export function currentChapter(config: GameConfig, state: GameState): Chapter | undefined {
  return config.chapters.find((chapter) => chapter.id === state.story.chapterId)
}

export function currentStep(config: GameConfig, state: GameState): Step | undefined {
  if (state.story.phase !== 'playing') return undefined
  return currentChapter(config, state)?.steps[state.story.stepIndex]
}

export function shouldPulseHint(state: GameState): boolean {
  return state.story.phase === 'playing' && state.story.misses >= PULSE_AFTER_MISSES
}

/** The current step plus any steps reachable by skipping optional ones. */
function candidateIndexes(chapter: Chapter, from: number): number[] {
  const indexes: number[] = []
  for (let i = from; i < chapter.steps.length; i++) {
    indexes.push(i)
    if (!chapter.steps[i].optional) break
  }
  return indexes
}

function completeStep(
  state: GameState,
  chapter: Chapter,
  index: number,
  event: GameEvent
): { state: GameState; effects: Effect[]; events: GameEvent[] } {
  const step = chapter.steps[index]
  const skipped = chapter.steps.slice(state.story.stepIndex, index).map((s) => s.id)
  let next: GameState = step.apply ? step.apply(state, event) : state
  const stepIndex = index + 1
  const finished = stepIndex >= chapter.steps.length
  next = {
    ...next,
    story: {
      ...next.story,
      stepIndex,
      completedSteps: [...next.story.completedSteps, step.id],
      skippedSteps: [...next.story.skippedSteps, ...skipped],
      misses: 0,
      hintsShown: 0,
      solutionShown: false,
      ...(finished
        ? {
            phase: 'complete' as const,
            completedChapters: next.story.completedChapters.includes(chapter.id)
              ? next.story.completedChapters
              : [...next.story.completedChapters, chapter.id],
          }
        : {}),
    },
  }
  const effects = [...(step.onComplete ?? [])]
  const events: GameEvent[] = []
  if (!finished) {
    const upcoming = chapter.steps[stepIndex]
    effects.push(...(upcoming.onEnter ?? []))
    events.push({ type: 'stepEntered', stepId: upcoming.id })
  }
  return { state: next, effects, events }
}

function checkEvent(
  config: GameConfig,
  state: GameState,
  event: GameEvent
): { state: GameState; effects: Effect[]; events: GameEvent[] } {
  const chapter = currentChapter(config, state)
  if (!chapter || state.story.phase !== 'playing') return { state, effects: [], events: [] }

  for (const index of candidateIndexes(chapter, state.story.stepIndex)) {
    if (chapter.steps[index].goal(state, event)) {
      return completeStep(state, chapter, index, event)
    }
  }

  if (event.type === 'command' && !NEUTRAL_COMMANDS.has(event.name)) {
    const misses = state.story.misses + 1
    const step = chapter.steps[state.story.stepIndex]
    const hintsShown =
      misses >= AUTO_HINT_AFTER_MISSES && step.hints.length > 0
        ? Math.max(state.story.hintsShown, 1)
        : state.story.hintsShown
    return {
      state: { ...state, story: { ...state.story, misses, hintsShown } },
      effects: [],
      events: [],
    }
  }
  return { state, effects: [], events: [] }
}

/**
 * Applies effects and walks events through the current step's goal, in order. Completing a step
 * can apply more effects and raise more events (a coworker's reply, the next step being entered),
 * which are processed in the same pass. Delayed effects are returned for the store to schedule.
 */
export function advanceStory(
  config: GameConfig,
  initial: GameState,
  initialEvents: GameEvent[],
  initialEffects: Effect[] = []
): ReduceResult {
  let state = initial
  const queue: GameEvent[] = []
  const delayed: Effect[] = []

  const runEffects = (effects: Effect[]) => {
    for (const effect of effects) {
      if (effect.delayMs && effect.delayMs > 0) {
        delayed.push(effect)
        continue
      }
      const result = applyEffect(config, state, effect)
      state = result.state
      queue.push(...result.events)
    }
  }

  queue.push(...initialEvents)
  runEffects(initialEffects)

  let processed = 0
  while (queue.length > 0) {
    if (++processed > MAX_EVENTS) throw new Error('Story runner: too many events (a goal loop?)')
    const event = queue.shift()!
    const result = checkEvent(config, state, event)
    state = result.state
    runEffects(result.effects)
    queue.push(...result.events)
  }

  return { state, effects: delayed }
}

/** Runs the current step's `onEnter` effects and checks whether it's already satisfied. */
export function enterStep(config: GameConfig, state: GameState): ReduceResult {
  const step = currentStep(config, state)
  if (!step) return { state, effects: [] }
  return advanceStory(config, state, [{ type: 'stepEntered', stepId: step.id }], step.onEnter ?? [])
}
