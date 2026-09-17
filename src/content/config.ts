import type { Chapter, GameConfig } from '../engine/story/types'
import { buildRegistry } from '../engine/shell/commands'
import type { GameState } from '../engine/game'
import { currentStep } from '../engine/story/runner'
import { interpolate } from '../engine/story/template'
import { DOCS } from './docsLinks'
import { GENERAL_QUESTIONS, MENTOR_FAQ } from './mentorFaq'
import { CHANNELS, DEFAULT_CHANNEL, MENTOR_CHANNEL } from './channels'
import { characters } from './characters'
import { createRemotes, WORLD_START } from './world'

/**
 * Placeholder until Chapter 0 lands (#20): one step that completes when the learner looks at
 * GitNub, so the shell has something to render.
 */
const placeholderChapter: Chapter = {
  id: '00-welcome',
  title: 'Welcome to Inkwell',
  milestone: 'day-one',
  intro: 'Your first day starts here.',
  setup: (state) => ({ ...state, ui: { ...state.ui, unlockedTabs: ['flack', 'gitnub'] } }),
  steps: [
    {
      id: 'open-gitnub',
      title: 'Open GitNub',
      body: 'Click the **GitNub** tab.',
      hints: ['GitNub is the second tab in the middle panel.'],
      goal: (_state, event) => event.type === 'tabOpened' && event.tab === 'gitnub',
    },
  ],
  mentorQuestions: ['what-is-a-repo', 'how-do-i-clone'],
  summary: [],
}

export function createGameConfig(): GameConfig {
  const config: GameConfig = {
    chapters: [placeholderChapter],
    registry: buildRegistry<GameState>({
      docs: DOCS,
      hintFor: (state) => {
        const step = currentStep(config, state)
        if (!step || step.hints.length === 0) return undefined
        const index = Math.min(state.story.hintsShown, step.hints.length - 1)
        return interpolate(step.hints[index], state)
      },
    }),
    characters,
    channels: CHANNELS,
    defaultChannel: DEFAULT_CHANNEL,
    createRemotes,
    startTime: WORLD_START,
    mentor: { characterId: 'robin', channel: MENTOR_CHANNEL, entries: MENTOR_FAQ },
    mentorGeneralQuestions: GENERAL_QUESTIONS,
  }
  return config
}
