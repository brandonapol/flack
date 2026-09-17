import type { FileEdit } from '../git/sync'
import type { Person } from '../git/types'
import type { GameEvent, Tab } from '../events'
import type { Registry } from '../shell/registry'
import type { GameState } from '../game'

export interface QuickReply {
  id: string
  text: string
}

/**
 * Something the story makes happen. Effects are plain data (no functions) so that delayed ones can
 * be saved with the game and still fire after a reload.
 */
export type Effect = (
  | {
      type: 'flackMessage'
      /** Stable id when a step needs to refer to the message (e.g. to wait for a reply). */
      id?: string
      channel: string
      /** Character id, or `player`. */
      from: string
      text: string
      quickReplies?: QuickReply[]
    }
  | {
      type: 'remoteCommit'
      slug: string
      /** Character id. */
      author: string
      message: string
      edits: FileEdit[]
      branch?: string
    }
  | {
      type: 'reviewPullRequest'
      slug: string
      number: number
      /** Character id of the reviewer. */
      author: string
      body: string
      approve?: boolean
    }
  | { type: 'unlockTab'; tab: Tab }
  | { type: 'openTab'; tab: Tab }
  | { type: 'openFile'; path: string }
  | { type: 'focusPanel'; panel: 'terminal' | 'middle' }
  | { type: 'toast'; text: string }
  | { type: 'showHint' }
) & {
  /** Wait this long before applying. Only the store honours delays; tests apply at once. */
  delayMs?: number
}

export interface DocsLink {
  label: string
  href: string
}

export interface Step {
  id: string
  /** Checklist label. */
  title: string
  /** Markdown shown in Instructions. `{{player.name}}`-style templates are filled in. */
  body: string
  goal: (state: GameState, event: GameEvent) => boolean
  /** Shown one at a time, in order. */
  hints: string[]
  /** "Show me": the exact command or action. */
  solution?: string
  /** "What just happened", shown after the step completes. */
  afterNote?: string
  docs?: DocsLink[]
  optional?: boolean
  /**
   * Repo files the learner may edit during this step. Everything else opens read-only, so nobody
   * wanders into an unscripted change. Omit to allow editing any file.
   */
  editableFiles?: string[]
  onEnter?: Effect[]
  onComplete?: Effect[]
  /** State changes that can't be expressed as effects, e.g. capturing the player's name. */
  apply?: (state: GameState, event: GameEvent) => GameState
}

export interface Chapter {
  id: string
  title: string
  milestone: 'day-one' | 'keeping-in-sync'
  intro: string
  /** Builds a valid starting state from the previous one, or from scratch when jumping here. */
  setup: (state: GameState, config: GameConfig) => GameState
  steps: Step[]
  mentorQuestions: string[]
  /** Bullet points for the completion screen. */
  summary: string[]
}

export interface Character extends Person {
  id: string
  initials: string
  role: string
  color: string
}

export interface Channel {
  id: string
  /** `docs-team` for channels; the character's name is shown for DMs. */
  name: string
  kind: 'channel' | 'dm'
  /** For DMs: who it's with. */
  characterId?: string
  topic?: string
}

export interface MentorEntry {
  question: string
  answer: string
}

/** Everything the engine needs from content. The engine never imports content directly. */
export interface GameConfig {
  chapters: Chapter[]
  registry: Registry<GameState>
  characters: Record<string, Character>
  /** Flack channels and DMs, in sidebar order. */
  channels: Channel[]
  /** The channel Flack opens on. Defaults to the first channel (not DM) in the list. */
  defaultChannel?: string
  /** Fresh GitNub repos for a new game. */
  createRemotes: () => GameState['git']['remotes']
  /** The clock at the start of a new game. */
  startTime: number
  mentor?: {
    characterId: string
    channel: string
    entries: Record<string, MentorEntry>
  }
  /** Questions Ask Robin always offers, on top of the current chapter's. */
  mentorGeneralQuestions?: string[]
}
