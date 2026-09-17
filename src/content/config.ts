import type { Chapter, GameConfig } from '../engine/story/types'
import { createRegistry } from '../engine/shell/registry'
import type { GameState } from '../engine/game'
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
  mentorQuestions: [],
  summary: [],
}

export function createGameConfig(): GameConfig {
  return {
    chapters: [placeholderChapter],
    registry: createRegistry<GameState>(),
    characters,
    createRemotes,
    startTime: WORLD_START,
  }
}
