import { act, render, screen } from '@testing-library/react'
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

describe('the end of the last chapter', () => {
  it('says you’re all caught up', () => {
    const config = createGameConfig()
    setupFinished(config, config.chapters.at(-1)!, 'finished')
    expect(screen.getByRole('region', { name: 'All caught up' })).toHaveTextContent(
      'You’re all caught up'
    )
    expect(screen.getByRole('link', { name: 'Open the cheat sheet' })).toBeInTheDocument()
  })
})
