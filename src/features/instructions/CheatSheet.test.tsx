import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import { CheatSheet } from './CheatSheet'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function renderSheet(options: { graduated?: boolean } = {}) {
  const config = createGameConfig()
  const store = createGameStore({ config, storage: noStorage })
  if (options.graduated) {
    const { game } = store.getState()
    store.setState({
      game: {
        ...game,
        story: { ...game.story, completedChapters: config.chapters.map((chapter) => chapter.id) },
      },
    })
  }
  return render(
    <GameStoreProvider store={store}>
      <MemoryRouter>
        <CheatSheet />
      </MemoryRouter>
    </GameStoreProvider>
  )
}

describe('cheat sheet', () => {
  it('is headed “The daily loop” and lists the whole loop in order', () => {
    renderSheet()
    expect(screen.getByRole('heading', { name: 'The daily loop', level: 1 })).toBeInTheDocument()
    const steps = screen
      .getAllByRole('listitem')
      .map((item) => item.querySelector('code')?.textContent)
    expect(steps).toEqual([
      'git switch main',
      'git pull',
      'git switch -c my-change',
      '(edit and save your files)',
      'git status',
      'git add my-file.md',
      'git commit -m "What I changed"',
      'git push -u origin my-change',
      'Open the pull request',
      'Squash and merge',
      'Delete branch',
      'git switch main',
      'git pull',
    ])
  })

  it('says what a branch, a squash, Update branch and conflicts are, without going deep', () => {
    renderSheet()
    const also = screen.getByRole('heading', { name: /You’ll also hear about/ }).parentElement!
    expect(within(also).getByText('A branch')).toBeInTheDocument()
    expect(within(also).getByText('Squash')).toBeInTheDocument()
    expect(within(also).getByText('Update branch')).toBeInTheDocument()
    expect(within(also).getByText('Conflicts')).toBeInTheDocument()
    expect(also).toHaveTextContent('next module')
  })

  it('never mentions trunk-based development', () => {
    const { container } = renderSheet()
    expect(container.textContent?.toLowerCase()).not.toContain('trunk')
  })

  it('after Keeping in sync, says what to do when a pull request is out of date or conflicts', () => {
    renderSheet({ graduated: true })
    expect(screen.getByRole('heading', { name: 'The daily loop', level: 1 })).toBeInTheDocument()
    const when = screen.getByRole('heading', {
      name: 'When your pull request says…',
    }).parentElement!
    expect(within(when).getByRole('heading', { name: '…it’s out of date' })).toBeInTheDocument()
    expect(within(when).getByRole('heading', { name: '…it has conflicts' })).toBeInTheDocument()
    expect(when).toHaveTextContent('Keep both')
    expect(when).toHaveTextContent('Mark as resolved')
    expect(when).toHaveTextContent('No markers to edit')
    expect(screen.getByRole('link', { name: 'Rebasing' })).toBeInTheDocument()
    expect(screen.queryByText('You’ll also hear about…')).not.toBeInTheDocument()
  })
})
