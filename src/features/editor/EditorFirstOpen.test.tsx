import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import Editor from './Editor'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

describe('opening the Editor for the first time', () => {
  it('offers the file the step is about, and opening it completes the step', async () => {
    const store = createGameStore({
      config: createGameConfig(),
      storage: noStorage,
      search: '?chapter=02',
    })
    render(
      <GameStoreProvider store={store}>
        <MemoryRouter initialEntries={['/editor']}>
          <Routes>
            <Route path="/editor/*" element={<Editor />} />
          </Routes>
        </MemoryRouter>
      </GameStoreProvider>
    )
    expect(screen.getByText('No file open yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open team.md' }))
    expect(store.getState().game.editor.openPath).toBe('team.md')
    expect(store.getState().game.story.completedSteps).toContain('open-team-md')
  })

  it('files are read-only unless the current step is about them', async () => {
    const store = createGameStore({
      config: createGameConfig(),
      storage: noStorage,
      search: '?chapter=03',
    })
    render(
      <GameStoreProvider store={store}>
        <MemoryRouter initialEntries={['/editor/README.md']}>
          <Routes>
            <Route path="/editor/*" element={<Editor />} />
          </Routes>
        </MemoryRouter>
      </GameStoreProvider>
    )
    expect(await screen.findByRole('note')).toHaveTextContent('This file is read-only right now')
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
  })
})
