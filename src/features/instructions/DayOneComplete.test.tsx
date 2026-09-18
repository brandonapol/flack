import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { createGameConfig } from '../../content'
import type { GameConfig } from '../../engine/story/types'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import { Instructions } from './Instructions'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

/**
 * A chapter, finished: by default the last one of Day one. `chapters.test.ts` checks the golden
 * path really gets here.
 */
function setupFinished(
  config: GameConfig = createGameConfig(),
  last = config.chapters.filter((chapter) => chapter.milestone === 'day-one').at(-1)!,
  phase: 'complete' | 'finished' = 'complete'
) {
  const store = createGameStore({ config, storage: noStorage, search: `?chapter=${last.id}` })
  const { game } = store.getState()
  act(() => {
    store.setState({
      game: {
        ...game,
        story: {
          ...game.story,
          phase,
          stepIndex: last.steps.length,
          completedSteps: last.steps.map((step) => step.id),
          completedChapters: config.chapters.map((chapter) => chapter.id),
        },
      },
    })
  })
  render(
    <GameStoreProvider store={store}>
      <MemoryRouter>
        <Instructions />
      </MemoryRouter>
    </GameStoreProvider>
  )
  return store
}

describe('Day one complete', () => {
  it('appears after the last Day one chapter, with what you learned and the cheat sheet', () => {
    const store = setupFinished()
    expect(store.getState().game.story.phase).toBe('complete')
    const panel = screen.getByRole('region', { name: 'Day one complete' })
    expect(panel).toHaveTextContent('Day one complete 🎉')
    expect(panel).toHaveTextContent('git clone')
    expect(panel).toHaveTextContent('Squash and merge')
    expect(screen.getByRole('link', { name: 'Open the cheat sheet' })).toHaveAttribute(
      'href',
      '/cheat-sheet'
    )
  })

  it('lists only what Day one taught', () => {
    setupFinished()
    expect(screen.getByRole('region', { name: 'Day one complete' })).not.toHaveTextContent(
      'git fetch'
    )
  })

  it('offers a message to share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setupFinished()
    const button = screen.getByRole('button', { name: 'Copy a message to share' })
    await act(async () => void button.click())
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Day one'))
  })

  it('continues into Keeping in sync', () => {
    const store = setupFinished()
    const button = screen.getByRole('button', { name: 'Continue to Keeping in sync' })
    act(() => button.click())
    expect(store.getState().game.story).toMatchObject({
      chapterId: '05-look-before-you-leap',
      phase: 'playing',
    })
    expect(screen.getByRole('heading', { name: 'Look before you leap', level: 1 })).toBeVisible()
  })

  it('says Keeping in sync is coming when there are no chapters for it yet', () => {
    const full = createGameConfig()
    const config = {
      ...full,
      chapters: full.chapters.filter((chapter) => chapter.milestone === 'day-one'),
    }
    setupFinished(config)
    expect(screen.getByRole('button', { name: 'Continue to Keeping in sync' })).toBeDisabled()
    expect(screen.getByText('— coming soon')).toBeInTheDocument()
  })
})

describe('the end of Keeping in sync', () => {
  it('graduates, with what you learned, the cheat sheet and where to go next', () => {
    const config = createGameConfig()
    const last = config.chapters
      .filter((chapter) => chapter.milestone === 'keeping-in-sync')
      .at(-1)!
    setupFinished(config, last)
    const card = screen.getByRole('region', { name: 'You’ve graduated' })
    expect(card).toHaveTextContent('You’ve graduated 🎓')
    expect(card).toHaveTextContent('Update branch')
    expect(card).not.toHaveTextContent('git clone')
    expect(within(card).getByRole('link', { name: 'Open the cheat sheet' })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Rebasing ↗' })).toBeInTheDocument()
  })

  it('offers the bonus chapter, which starts when chosen', () => {
    const config = createGameConfig()
    const last = config.chapters
      .filter((chapter) => chapter.milestone === 'keeping-in-sync')
      .at(-1)!
    const store = setupFinished(config, last)
    act(() => screen.getByRole('button', { name: 'Try the bonus chapter' }).click())
    expect(store.getState().game.story.chapterId).toBe('09-oops')
    expect(screen.getByText('Bonus chapter')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Oops: undoing things', level: 1 })
    ).toBeInTheDocument()
  })

  it('ends the bonus chapter with its own card, not Keep going', () => {
    const config = createGameConfig()
    setupFinished(
      config,
      config.chapters.find((chapter) => chapter.id === '09-oops')!
    )
    const card = screen.getByRole('region', { name: 'Bonus complete' })
    expect(card).toHaveTextContent('git restore --staged <file>')
    expect(screen.queryByRole('button', { name: 'Keep going' })).not.toBeInTheDocument()
  })
})
