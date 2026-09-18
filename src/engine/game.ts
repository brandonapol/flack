import type { Tab } from './events'
import { line, spans } from './lines'
import { promptFor } from './shell/prompt'
import {
  deleteRemoteBranch,
  findPullRequest,
  openPullRequest,
  openPullRequestFor,
  squashMerge,
  updateBranch,
} from './git/pullRequests'
import type { RemoteRepo } from './git/types'
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
  /** Reactions that have already fired, as `<stepId>:<reactionId>`. */
  firedReactions: string[]
  hintsShown: number
  solutionShown: boolean
  /** The state when the chapter started, for "Restart chapter". */
  checkpoint?: Omit<GameState, 'story'> & { story: Omit<StoryState, 'checkpoint'> }
}

export interface GameState extends CoreState {
  version: number
  editor: {
    openPath?: string
    /** Unsaved text per file. Present only while it differs from the saved file. */
    buffers: Record<string, string>
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
    /** Files whose unsaved edits stopped the last command. The UI asks to save or discard. */
    unsavedBlock?: string[]
  }
  story: StoryState
}

export type Action =
  | { type: 'runCommand'; line: string }
  /** ⌘K / Ctrl+L: clear the screen without running anything. */
  | { type: 'clearTerminal' }
  /** Ctrl+C: abandon a half-typed line, echoing it with `^C` like a real shell. */
  | { type: 'cancelInput'; text: string }
  | { type: 'saveFile'; path: string; content: string }
  /** Typing in the Editor. Keeps the unsaved text; nothing reaches Git until `saveFile`. */
  | { type: 'editBuffer'; path: string; content: string }
  | { type: 'discardBuffer'; path: string }
  | { type: 'dismissUnsavedBlock' }
  | { type: 'openFile'; path: string }
  | { type: 'openTab'; tab: Tab }
  | { type: 'openChannel'; channel: string }
  | { type: 'viewRepo'; slug: string }
  | { type: 'copyCloneUrl'; slug: string }
  | { type: 'flackReply'; messageId: string; replyId: string }
  | { type: 'askMentor'; questionId: string }
  | { type: 'openPullRequest'; slug: string; branch: string; title: string; body?: string }
  | { type: 'mergePullRequest'; slug: string; number: number }
  | { type: 'updateBranch'; slug: string; number: number }
  | { type: 'deleteRemoteBranch'; slug: string; branch: string }
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
    editor: { buffers: {} },
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
      firedReactions: [],
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
        firedReactions: [],
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
      const clobbered = unsavedPathsChanged(state, result.state)
      if (clobbered.length > 0) {
        // Undo the command: it would have replaced files the learner is still editing.
        const echo = result.output[0]
        const blocked: GameState = {
          ...state,
          shell: {
            ...state.shell,
            history: result.state.shell.history,
            output: [
              ...state.shell.output,
              ...(echo ? [echo] : []),
              line(
                `✋ You have unsaved edits in ${clobbered.join(', ')}. Save or discard them in the Editor, then run that again.`,
                'error'
              ),
            ],
          },
          ui: { ...state.ui, unsavedBlock: clobbered },
        }
        return { state: blocked, effects: [] }
      }
      return advanceStory(config, result.state, result.events, result.effects)
    }

    case 'editBuffer': {
      const saved = state.git.local?.working[action.path]
      if (saved === undefined) return { state: previous, effects: [] }
      const buffers = { ...state.editor.buffers }
      if (action.content === saved) delete buffers[action.path]
      else buffers[action.path] = action.content
      // Typing doesn't move the fake clock.
      return { state: { ...previous, editor: { ...previous.editor, buffers } }, effects: [] }
    }

    case 'discardBuffer': {
      const buffers = { ...state.editor.buffers }
      delete buffers[action.path]
      const remaining = state.ui.unsavedBlock?.filter((path) => path in buffers)
      return {
        state: {
          ...state,
          editor: { ...state.editor, buffers },
          ui: { ...state.ui, unsavedBlock: remaining?.length ? remaining : undefined },
        },
        effects: [],
      }
    }

    case 'dismissUnsavedBlock':
      return { state: { ...state, ui: { ...state.ui, unsavedBlock: undefined } }, effects: [] }

    case 'clearTerminal':
      return { state: { ...state, shell: { ...state.shell, output: [] } }, effects: [] }

    case 'cancelInput': {
      const echo = spans({ text: promptFor(state), tone: 'prompt' }, { text: ` ${action.text}^C` })
      return {
        state: { ...state, shell: { ...state.shell, output: [...state.shell.output, echo] } },
        effects: [],
      }
    }

    case 'saveFile': {
      const local = state.git.local
      if (!local || !(action.path in local.working)) return { state: previous, effects: [] }
      const buffers = { ...state.editor.buffers }
      delete buffers[action.path]
      const remaining = state.ui.unsavedBlock?.filter((path) => path in buffers)
      const next: GameState = {
        ...state,
        git: {
          ...state.git,
          local: { ...local, working: { ...local.working, [action.path]: action.content } },
        },
        editor: { ...state.editor, buffers },
        ui: { ...state.ui, unsavedBlock: remaining?.length ? remaining : undefined },
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

    case 'openPullRequest': {
      const remote = state.git.remotes[action.slug]
      if (!remote || !remote.branches[action.branch]) return { state: previous, effects: [] }
      if (openPullRequestFor(remote, action.branch)) return { state: previous, effects: [] }
      const result = openPullRequest(remote, {
        branch: action.branch,
        title: action.title,
        body: action.body,
        timestamp: state.clock,
      })
      return advanceStory(config, withRemote(state, result.remote), [
        { type: 'pullRequestOpened', number: result.pullRequest.number, branch: action.branch },
      ])
    }

    case 'mergePullRequest': {
      const remote = state.git.remotes[action.slug]
      const pr = remote && findPullRequest(remote, action.number)
      if (!remote || !pr || pr.status === 'merged') return { state: previous, effects: [] }
      const result = squashMerge(remote, pr, {
        author: {
          name: state.git.config.userName ?? state.player.name ?? 'You',
          email: state.git.config.userEmail ?? 'you@inkwell.example',
        },
        timestamp: state.clock,
      })
      return advanceStory(config, withRemote(state, result.remote), [
        { type: 'pullRequestMerged', number: pr.number, branch: pr.branch },
      ])
    }

    case 'updateBranch': {
      const remote = state.git.remotes[action.slug]
      const pr = remote && findPullRequest(remote, action.number)
      if (!remote || !pr || pr.status === 'merged') return { state: previous, effects: [] }
      const result = updateBranch(
        remote,
        pr,
        state.git.local?.slug === action.slug ? state.git.local : undefined
      )
      const next: GameState = {
        ...state,
        git: {
          ...state.git,
          remotes: { ...state.git.remotes, [action.slug]: result.remote },
          local: result.local ?? state.git.local,
        },
      }
      return advanceStory(config, next, [
        { type: 'branchUpdated', number: pr.number, branch: pr.branch },
      ])
    }

    case 'deleteRemoteBranch': {
      const remote = state.git.remotes[action.slug]
      if (!remote || !remote.branches[action.branch]) return { state: previous, effects: [] }
      return advanceStory(config, withRemote(state, deleteRemoteBranch(remote, action.branch)), [
        { type: 'remoteBranchDeleted', branch: action.branch },
      ])
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

/** Files with unsaved edits whose saved content a command just changed (or removed). */
function unsavedPathsChanged(before: GameState, after: GameState): string[] {
  const paths = Object.keys(before.editor.buffers)
  if (paths.length === 0) return []
  const was = before.git.local?.working ?? {}
  const now = after.git.local?.working ?? {}
  return paths.filter((path) => was[path] !== now[path]).sort()
}

function withRemote(state: GameState, remote: RemoteRepo): GameState {
  return {
    ...state,
    git: { ...state.git, remotes: { ...state.git.remotes, [remote.slug]: remote } },
  }
}
