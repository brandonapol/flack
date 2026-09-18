import type { GameConfig } from '../engine/story/types'
import { buildRegistry } from '../engine/shell/commands'
import type { GameState } from '../engine/game'
import { currentStep } from '../engine/story/runner'
import { interpolate } from '../engine/story/template'
import { DOCS } from './docsLinks'
import { GENERAL_QUESTIONS, MENTOR_FAQ } from './mentorFaq'
import { CHANNELS, DEFAULT_CHANNEL, MENTOR_CHANNEL } from './channels'
import { CHAPTERS } from './chapters'
import { characters } from './characters'
import { createRemotes, WORLD_START } from './world'

export function createGameConfig(): GameConfig {
  const config: GameConfig = {
    chapters: CHAPTERS,
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
