import type { GameEvent } from '../events'
import type { GameState } from '../game'
import { refreshPullRequests, reviewPullRequest } from '../git/pullRequests'
import { applyEdits, remoteCommit } from '../git/sync'
import { interpolate } from './template'
import type { Effect, GameConfig } from './types'

export interface EffectResult {
  state: GameState
  events: GameEvent[]
}

/** Applies one effect right now, ignoring any delay. */
export function applyEffect(config: GameConfig, state: GameState, effect: Effect): EffectResult {
  switch (effect.type) {
    case 'flackMessage': {
      const id = effect.id ?? `msg-${state.flack.messages.length + 1}`
      if (state.flack.messages.some((message) => message.id === id)) return { state, events: [] }
      const message = {
        id,
        channel: effect.channel,
        from: effect.from,
        text: interpolate(effect.text, state),
        time: state.clock,
        ...(effect.lab ? { lab: effect.lab } : {}),
        ...(effect.quickReplies
          ? {
              quickReplies: effect.quickReplies.map((reply) => ({
                ...reply,
                text: interpolate(reply.text, state),
              })),
            }
          : {}),
      }
      const watching =
        state.ui.activeTab === 'flack' && state.flack.activeChannel === effect.channel
      const readUpTo =
        effect.from === 'player' || watching
          ? {
              ...state.flack.readUpTo,
              [effect.channel]:
                state.flack.messages.filter((m) => m.channel === effect.channel).length + 1,
            }
          : state.flack.readUpTo
      return {
        state: {
          ...state,
          flack: { ...state.flack, messages: [...state.flack.messages, message], readUpTo },
        },
        events: [
          { type: 'flackMessage', messageId: id, channel: effect.channel, from: effect.from },
        ],
      }
    }

    case 'remoteCommit': {
      const remote = state.git.remotes[effect.slug]
      const author = config.characters[effect.author]
      if (!remote) throw new Error(`remoteCommit: unknown repo ${effect.slug}`)
      if (!author) throw new Error(`remoteCommit: unknown character ${effect.author}`)
      const result = remoteCommit(remote, {
        author: { name: author.name, email: author.email },
        message: interpolate(effect.message, state),
        timestamp: state.clock,
        branch: effect.branch,
        change: (tree) => applyEdits(tree, effect.edits),
      })
      return {
        state: {
          ...state,
          git: {
            ...state.git,
            remotes: { ...state.git.remotes, [effect.slug]: refreshPullRequests(result.remote) },
          },
        },
        events: [
          {
            type: 'remoteUpdated',
            slug: effect.slug,
            branch: effect.branch ?? remote.defaultBranch,
            author: effect.author,
          },
        ],
      }
    }

    case 'reviewPullRequest': {
      const remote = state.git.remotes[effect.slug]
      const author = config.characters[effect.author]
      if (!remote || !author) throw new Error(`reviewPullRequest: unknown repo or character`)
      const number =
        effect.number === 'latest'
          ? remote.pullRequests
              .filter((pr) => pr.status !== 'merged' && pr.status !== 'closed')
              .at(-1)?.number
          : effect.number
      if (number === undefined) return { state, events: [] }
      const reviewed = reviewPullRequest(remote, number, {
        author: effect.author,
        body: interpolate(effect.body, state),
        approve: effect.approve ?? true,
        timestamp: state.clock,
      })
      return {
        state: {
          ...state,
          git: { ...state.git, remotes: { ...state.git.remotes, [effect.slug]: reviewed } },
        },
        events: [{ type: 'pullRequestReviewed', number, approved: effect.approve ?? true }],
      }
    }

    case 'unlockTab':
      if (state.ui.unlockedTabs.includes(effect.tab)) return { state, events: [] }
      return {
        state: {
          ...state,
          ui: { ...state.ui, unlockedTabs: [...state.ui.unlockedTabs, effect.tab] },
        },
        events: [],
      }

    case 'openTab':
      if (!state.ui.unlockedTabs.includes(effect.tab)) return { state, events: [] }
      return {
        state: { ...state, ui: { ...state.ui, activeTab: effect.tab } },
        events: [{ type: 'tabOpened', tab: effect.tab }],
      }

    case 'openFile': {
      if (!state.ui.unlockedTabs.includes('editor')) return { state, events: [] }
      return {
        state: {
          ...state,
          editor: { ...state.editor, openPath: effect.path },
          ui: { ...state.ui, activeTab: 'editor' },
        },
        events: [
          { type: 'tabOpened', tab: 'editor' },
          { type: 'fileOpened', path: effect.path },
        ],
      }
    }

    case 'focusPanel':
      return { state, events: [] }

    case 'openCommitLab':
      if (!config.labScenarios?.[effect.scenario]) return { state, events: [] }
      return {
        state: { ...state, ui: { ...state.ui, commitLab: { scenario: effect.scenario } } },
        events: [],
      }

    case 'toast':
      return { state: { ...state, ui: { ...state.ui, toast: effect.text } }, events: [] }

    case 'showHint': {
      const step = config.chapters.find((c) => c.id === state.story.chapterId)?.steps[
        state.story.stepIndex
      ]
      const available = step?.hints.length ?? 0
      return {
        state: {
          ...state,
          story: { ...state.story, hintsShown: Math.min(state.story.hintsShown + 1, available) },
        },
        events: [],
      }
    }
  }
}
