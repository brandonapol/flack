import type { GameState } from '../../engine/game'
import type { GameConfig } from '../../engine/story/types'

/** The last chapter of a milestone: the one whose next chapter (if any) is in another. */
export function endsMilestone(config: GameConfig, chapterId: string): boolean {
  const index = config.chapters.findIndex((chapter) => chapter.id === chapterId)
  const chapter = config.chapters[index]
  return Boolean(chapter) && config.chapters[index + 1]?.milestone !== chapter.milestone
}

/** Finished Keeping in sync: the last chapter of it is done. */
export function hasGraduated(config: GameConfig, game: GameState): boolean {
  const last = config.chapters.filter((chapter) => chapter.milestone === 'keeping-in-sync').at(-1)
  if (!last) return false
  return (
    game.story.completedChapters.includes(last.id) ||
    (game.story.chapterId === last.id && game.story.phase !== 'playing')
  )
}
