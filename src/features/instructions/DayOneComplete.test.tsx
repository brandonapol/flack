import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import { Instructions } from './Instructions'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

/** The last chapter, finished. `chapters.test.ts` checks the golden path really gets here. */
function setupFinished() {
  const config = createGameConfig()
  const last = config.chapters[config.chapters.length - 1]
  const store = createGameStore({ config, storage: noStorage, search: `?chapter=${last.id}` })
  const { game } = store.getState()
  act(() => {
    store.setState({
      game: {
        ...game,
        story: {
          ...game.story,
          phase: 'complete',
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
  it('appears after the last chapter, with what you learned and the cheat sheet', () => {
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

  it('offers a message to share, and says the next module is coming', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setupFinished()
    const button = screen.getByRole('button', { name: 'Copy a message to share' })
    await act(async () => void button.click())
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Day one'))
    expect(screen.getByRole('button', { name: 'Continue to Keeping in sync' })).toBeDisabled()
  })
})
