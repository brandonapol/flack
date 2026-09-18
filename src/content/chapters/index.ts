import type { Chapter } from '../../engine/story/types'
import { welcomeChapter } from './00-welcome'
import { cloneChapter } from './01-clone'
import { signTheListChapter } from './02-sign-the-list'
import { pullRequestChapter } from './03-pull-request'
import { pullChapter } from './04-pull'
import { fetchChapter } from './05-fetch'
import { updateBranchChapter } from './06-update-branch'
import { tidierHistoryChapter } from './07-tidier-history'
import { conflictChapter } from './08-conflict'
import { oopsChapter } from './09-oops'

/** Every chapter, in order: Day one, Keeping in sync, then the bonus round. */
export const CHAPTERS: Chapter[] = [
  welcomeChapter,
  cloneChapter,
  signTheListChapter,
  pullRequestChapter,
  pullChapter,
  fetchChapter,
  updateBranchChapter,
  tidierHistoryChapter,
  conflictChapter,
  oopsChapter,
]

export * from './helpers'
