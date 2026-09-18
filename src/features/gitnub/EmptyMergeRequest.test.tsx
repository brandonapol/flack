import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, GameStoreProvider, type GameStore, type StorageLike } from '../../store'
import { GitNub } from './GitNub'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
const SLUG = 'inkwell/docs-site'

/** #91: a branch pushed with nothing on it. */
function pushEmptyBranch(): GameStore {
  const store = createGameStore({ config: createGameConfig(), storage: noStorage })
  const run = (line: string) => store.getState().dispatch({ type: 'runCommand', line })
  act(() => {
    run('git clone https://gitnub.com/inkwell/docs-site.git')
    run('cd docs-site')
    run('git switch -c evil')
    run('git push -u origin evil')
  })
  return store
}

function show(store: GameStore, path: string) {
  render(
    <GameStoreProvider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/gitnub/*" element={<GitNub />} />
        </Routes>
      </MemoryRouter>
    </GameStoreProvider>
  )
}

describe('a branch with no commits of its own', () => {
  it('gets no Create merge request nudge', () => {
    const store = pushEmptyBranch()
    expect(store.getState().game.git.remotes[SLUG].branches.evil).toBeDefined()
    show(store, `/gitnub/${SLUG}`)
    expect(screen.queryByRole('link', { name: 'Create merge request' })).not.toBeInTheDocument()
  })

  it('the form says there is nothing to review and won’t create one', () => {
    show(pushEmptyBranch(), `/gitnub/${SLUG}/compare/evil`)
    expect(screen.getByRole('note')).toHaveTextContent('Nothing to review yet')
    expect(screen.getByRole('button', { name: 'Create merge request' })).toBeDisabled()
  })

  it('the engine refuses to open or merge one, and doesn’t use up a number', () => {
    const store = pushEmptyBranch()
    const before = store.getState().game.git.remotes[SLUG]
    act(() =>
      store.getState().dispatch({ type: 'openPullRequest', slug: SLUG, branch: 'evil', title: 'x' })
    )
    const after = store.getState().game.git.remotes[SLUG]
    expect(after.pullRequests).toHaveLength(0)
    expect(after.nextPullRequest).toBe(before.nextPullRequest)
    expect(after.branches.main).toBe(before.branches.main)
  })
})
