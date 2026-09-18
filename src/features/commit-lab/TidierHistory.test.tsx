import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import { Instructions } from '../instructions'
import { CommitLab } from './CommitLab'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

const commit = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`^${label.replace(/[+]/g, '\\+')},`) })
const press = (element: Element) => act(() => void fireEvent.keyDown(element, { key: 'Enter' }))

/** Keyboard only: Enter on one commit, Enter on another, then Enter on the menu choice. */
function perform(source: string, target: string, action: string) {
  press(commit(source))
  press(commit(target))
  const choice = within(screen.getByRole('group', { name: 'What should happen?' })).getByRole(
    'button',
    { name: action }
  )
  act(() => void fireEvent.click(choice))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Chapter 7 in the Commit Lab', () => {
  it('both challenges, keyboard only, with a merge detour undone along the way', () => {
    const store = createGameStore({
      config: createGameConfig(),
      storage: noStorage,
      search: '?chapter=07',
    })
    render(
      <GameStoreProvider store={store}>
        <MemoryRouter>
          <Instructions />
          <CommitLab />
        </MemoryRouter>
      </GameStoreProvider>
    )
    act(() => store.getState().dispatch({ type: 'openChannel', channel: 'dm-robin' }))
    act(() => void vi.advanceTimersByTime(1200))

    // Challenge A: squash.
    expect(screen.getByRole('dialog', { name: 'Four commits, one change' })).toBeInTheDocument()
    perform('wip', 'final', 'Squash into here')
    expect(commit('Reword the formatting tips')).toHaveAccessibleName(/squashed from 4 commits/)
    expect(store.getState().game.story.completedSteps).toEqual(['read-robin', 'squash'])

    // Challenge B: rebase. Instructions shows merge and rebase side by side.
    act(() => void vi.advanceTimersByTime(1500))
    expect(screen.getByRole('dialog', { name: 'One straight line' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Merge: / })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Rebase: / })).toBeInTheDocument()

    perform('Reword the formatting tips', 'Add two team tips', 'Merge with here')
    expect(screen.getByText(/Perfectly valid — but here we want one straight line/)).toBeVisible()
    expect(store.getState().game.story.completedSteps).toEqual(['read-robin', 'squash'])

    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Undo' })))
    perform('Reword the formatting tips', 'Add two team tips', 'Rebase onto here')
    expect(screen.getByText(/exactly what/)).toHaveTextContent('Rebase did for you')
    expect(store.getState().game.story.completedSteps).toEqual(['read-robin', 'squash', 'rebase'])
    expect(store.getState().game.story.phase).toBe('complete')
  })
})
