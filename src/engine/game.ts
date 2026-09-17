import type { Tab } from './events'
import { runLine } from './shell/run'
import { HOME, type CoreState } from './state'
import { applyEffect } from './story/effects'
import { advanceStory, enterStep } from './story/runner'
import type { Effect, GameConfig, QuickReply } from './story/types'

export const GAME_STATE_VERSION = 1

export interface FlackMessage {
  id: string
  channel: string
  /** Character id, or `player`. */
  from: string
  text: string
  time: number
  quickReplies?: QuickReply[]
  /** The quick reply the learner picked, once they have. */
  repliedWith?: string
}

export interface StoryState {
  chapterId: string
  /** `playing` a step, chapter `complete` (summary showing), or the whole game `finished`. */
  phase: 'playing' | 'complete' | 'finished'
  stepIndex: number
  completedSteps: string[]
  skippedSteps: string[]
  completedChapters: string[]
  /** Commands run on the current step that didn't complete it. */
  misses: number
  hintsShown: number
  solutionShown: boolean
  /** The state when the chapter started, for "Restart chapter". */
  checkpoint?: Omit<GameState, 'story'> & { story: Omit<StoryState, 'checkpoint'> }
}

export interface GameState extends CoreState {
  version: number
  editor: {
    openPath?: string
  }
  flack: {
    messages: FlackMessage[]
    /** Channel → number of messages seen. */
    readUpTo: Record<string, number>
    activeChannel?: string
  }
  ui: {
    activeTab: Tab
    unlockedTabs: Tab[]
    toast?: string
  }
  story: StoryState
}

export type Action =
  | { type: 'runCommand'; line: string }
  | { type: 'saveFile'; path: string; content: string }
  | { type: 'openFile'; path: string }
  | { type: 'openTab'; tab: Tab }
  | { type: 'openChannel'; channel: string }
  | { type: 'viewRepo'; slug: string }
  | { type: 'copyCloneUrl'; slug: string }
  | { type: 'flackReply'; messageId: string; replyId: string }
  | { type: 'askMentor'; questionId: string }
  | { type: 'applyEffect'; effect: Effect }
  | { type: 'showHint' }
  | { type: 'revealSolution' }
  | { type: 'dismissToast' }
  | { type: 'restartChapter' }
  | { type: 'startChapter'; chapterId: string }
  | { type: 'continueStory' }

export interface ReduceResult {
  state: GameState
  /** Effects with a delay, for the store to schedule. Everything else is already applied. */
  effects: Effect[]
}

/** Fake seconds that pass per action, so commits and messages get plausible, increasing times. */
const TICK = 20

export function blankState(config: GameConfig): GameState {
  return {
    version: GAME_STATE_VERSION,
    clock: config.startTime,
    player: {},
    git: { config: {}, remotes: config.createRemotes() },
    shell: { cwd: HOME, history: [], output: [] },
    editor: {},
    flack: { messages: [], readUpTo: {} },
    ui: { activeTab: 'flack', unlockedTabs: ['flack'] },
    story: {
      chapterId: config.chapters[0]?.id ?? '',
      phase: 'playing',
      stepIndex: 0,
      completedSteps: [],
      skippedSteps: [],
      completedChapters: [],
      misses: 0,
      hintsShown: 0,
      solutionShown: false,
    },
  }
}

/** A brand-new game, positioned at the first step of the first chapter. */
export function initialState(config: GameConfig): ReduceResult {
  return startChapter(config, blankState(config), config.chapters[0].id)
}

export function startChapter(config: GameConfig, from: GameState, chapterId: string): ReduceResult {
  const chapter = config.chapters.find((candidate) => candidate.id === chapterId)
  if (!chapter) throw new Error(`Unknown chapter: ${chapterId}`)
  const prepared = chapter.setup(
    {
      ...from,
      story: {
        ...from.story,
        chapterId,
        phase: 'playing',
        stepIndex: 0,
        completedSteps: [],
        skippedSteps: [],
        misses: 0,
        hintsShown: 0,
        solutionShown: false,
        checkpoint: undefined,
      },
    },
    config
  )
  const { checkpoint: _dropped, ...storyWithoutCheckpoint } = prepared.story // eslint-disable-line @typescript-eslint/no-unused-vars
  const withCheckpoint: GameState = {
    ...prepared,
    story: {
      ...prepared.story,
      checkpoint: { ...prepared, story: storyWithoutCheckpoint },
    },
  }
  return enterStep(config, withCheckpoint)
}

export function reduce(config: GameConfig, previous: GameState, action: Action): ReduceResult {
  const state: GameState = { ...previous, clock: previous.clock + TICK }

  switch (action.type) {
    case 'runCommand': {
      const result = runLine(config.registry, state, action.line)
      return advanceStory(config, result.state, result.events, result.effects)
    }

    case 'saveFile': {
      const local = state.git.local
      if (!local || !(action.path in local.working)) return { state: previous, effects: [] }
      const next: GameState = {
        ...state,
        git: {
          ...state.git,
          local: { ...local, working: { ...local.working, [action.path]: action.content } },
        },
      }
      return advanceStory(config, next, [{ type: 'fileSaved', path: action.path }])
    }

    case 'openFile':
    case 'openTab':
    case 'showHint':
      return advanceStory(config, state, [], [action])

    case 'dismissToast':
      return { state: { ...state, ui: { ...state.ui, toast: undefined } }, effects: [] }

    case 'openChannel': {
      const count = state.flack.messages.filter((m) => m.channel === action.channel).length
      const next: GameState = {
        ...state,
        flack: {
          ...state.flack,
          activeChannel: action.channel,
          readUpTo: { ...state.flack.readUpTo, [action.channel]: count },
        },
      }
      return advanceStory(config, next, [{ type: 'channelOpened', channel: action.channel }])
    }

    case 'viewRepo':
      return advanceStory(config, state, [{ type: 'repoViewed', slug: action.slug }])

    case 'copyCloneUrl':
      return advanceStory(config, state, [{ type: 'cloneUrlCopied', slug: action.slug }])

    case 'flackReply': {
      const message = state.flack.messages.find((m) => m.id === action.messageId)
      const reply = message?.quickReplies?.find((r) => r.id === action.replyId)
      if (!message || !reply || message.repliedWith) return { state: previous, effects: [] }
      const messages = state.flack.messages.map((m) =>
        m.id === message.id ? { ...m, repliedWith: reply.id } : m
      )
      const next: GameState = {
        ...state,
        flack: {
          ...state.flack,
          messages: [
            ...messages,
            {
              id: `reply-${message.id}`,
              channel: message.channel,
              from: 'player',
              text: reply.text,
              time: state.clock,
            },
          ],
        },
      }
      return advanceStory(config, next, [
        { type: 'flackReply', messageId: message.id, replyId: reply.id },
      ])
    }

    case 'askMentor': {
      const mentor = config.mentor
      const entry = mentor?.entries[action.questionId]
      if (!mentor || !entry) {
        return advanceStory(config, state, [
          { type: 'mentorQuestionAsked', questionId: action.questionId },
        ])
      }
      const asked = applyEffect(config, state, {
        type: 'flackMessage',
        channel: mentor.channel,
        from: 'player',
        text: entry.question,
      })
      const answered = applyEffect(config, asked.state, {
        type: 'flackMessage',
        channel: mentor.channel,
        from: mentor.characterId,
        text: entry.answer,
      })
      return advanceStory(config, answered.state, [
        ...asked.events,
        ...answered.events,
        { type: 'mentorQuestionAsked', questionId: action.questionId },
      ])
    }

    case 'applyEffect':
      return advanceStory(config, state, [], [{ ...action.effect, delayMs: undefined }])

    case 'revealSolution':
      return { state: { ...state, story: { ...state.story, solutionShown: true } }, effects: [] }

    case 'restartChapter': {
      const checkpoint = state.story.checkpoint
      if (!checkpoint) return { state: previous, effects: [] }
      return enterStep(config, {
        ...checkpoint,
        story: { ...checkpoint.story, checkpoint },
      })
    }

    case 'startChapter':
      return startChapter(config, state, action.chapterId)

    case 'continueStory': {
      if (state.story.phase !== 'complete') return { state: previous, effects: [] }
      const chapters = config.chapters
      const index = chapters.findIndex((chapter) => chapter.id === state.story.chapterId)
      const next = chapters[index + 1]
      if (!next) {
        return { state: { ...state, story: { ...state.story, phase: 'finished' } }, effects: [] }
      }
      return startChapter(config, state, next.id)
    }
  }
}
