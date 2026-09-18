import type { Chapter } from '../../engine/story/types'
import { welcomeChapter } from './00-welcome'
import { cloneChapter } from './01-clone'
import { signTheListChapter } from './02-sign-the-list'
import { pullRequestChapter } from './03-pull-request'
import { pullChapter } from './04-pull'

/** Day one, in order. */
export const CHAPTERS: Chapter[] = [
  welcomeChapter,
  cloneChapter,
  signTheListChapter,
  pullRequestChapter,
  pullChapter,
]

export * from './helpers'
