import type { GitConfig, LocalRepo, RemoteRepo } from './git/types'
import type { TerminalLine } from './lines'

/** The learner's pretend home folder. Shown as `~` everywhere. */
export const HOME = '/Users/you'

/**
 * The simulation's state. This file holds the parts the git and shell engines need; the story
 * engine adds the rest (#6).
 */
export interface CoreState {
  /** Fake seconds since the epoch. Every commit and message takes its time from here. */
  clock: number
  player: { name?: string }
  git: {
    config: GitConfig
    /** GitNub, keyed by slug (`inkwell/docs-site`). */
    remotes: Record<string, RemoteRepo>
    /** The learner's clone, once they have one. It lives at `~/<local.dir>`. */
    local?: LocalRepo
  }
  shell: {
    /** Absolute path, e.g. `/Users/you/docs-site/docs`. */
    cwd: string
    history: string[]
    output: TerminalLine[]
  }
}
