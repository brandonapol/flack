import type { FileEdit } from '../git/sync'
import type { Person } from '../git/types'
import type { GameEvent, Tab } from '../events'
import type { Registry } from '../shell/registry'
import type { GameState } from '../game'
import type { LabGraph, Resolution } from '../lab/graph'

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
      /** Offer "Try it in the Commit Lab" under the message, with this scenario. */
      lab?: string
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
      /** `latest`: the newest pull request that's still open. */
      number: number | 'latest'
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
  | { type: 'openCommitLab'; scenario: string }
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
  /** A picture under the step's text. */
  figure?: LabFigure
  /**
   * Repo files the learner may edit during this step. Everything else opens read-only, so nobody
   * wanders into an unscripted change. Omit to allow editing any file.
   */
  editableFiles?: string[]
  onEnter?: Effect[]
  onComplete?: Effect[]
  /** State changes that can't be expressed as effects, e.g. capturing the player's name. */
  apply?: (state: GameState, event: GameEvent) => GameState
  /**
   * Answers to things that happen *while* a step is unfinished: a command that failed in an
   * interesting way, a wrong turn worth a word from Robin. Each one fires at most once per step.
   */
  reactions?: Reaction[]
}

export interface Reaction {
  id: string
  when: (state: GameState, event: GameEvent) => boolean
  effects: Effect[]
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
  /** A Commit Lab scenario to try it in, offered under the answer. */
  lab?: string
}

/** A Commit Lab setup: a graph to rearrange, and (in guided mode) the shape to reach. */
export interface LabScenario {
  id: string
  title: string
  /** What to do, shown above the graph. Markdown. */
  intro: string
  start: LabGraph
  /** Guided mode: finished once the graph has this shape. Without it, the lab is a sandbox. */
  target?: LabGraph
  /** The message a squash gets here, instead of the old messages joined. */
  squashLabel?: string
  /** Said after an operation, on top of its caption: why it is (or isn't) the one we're after. */
  hints?: Partial<Record<'rebase' | 'merge' | 'squash' | 'cherryPick', string>>
  /** Said after a conflict is settled a particular way. */
  resolutionHints?: Partial<Record<Resolution, string>>
  /** Guided mode isn't finished if the last conflict was settled this way (e.g. `both`). */
  avoid?: Resolution
}

/** Commit graphs side by side, drawn in Instructions with the Commit Lab's renderer. */
export interface LabFigure {
  title: string
  panels: Array<{ label: string; description: string; graph: LabGraph }>
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
  labScenarios?: Record<string, LabScenario>
}
