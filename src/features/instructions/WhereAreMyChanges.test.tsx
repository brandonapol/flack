import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, GameStoreProvider, type GameStore, type StorageLike } from '../../store'
import { WhereAreMyChanges } from './WhereAreMyChanges'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
const SLUG = 'inkwell/docs-site'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup({ finished = false } = {}) {
  // Chapter 2 starts with a fresh clone, which is when the strip first appears.
  const store = createGameStore({
    config: createGameConfig(),
    storage: noStorage,
    search: '?chapter=02',
  })
  render(
    <GameStoreProvider store={store}>
      <WhereAreMyChanges finished={finished} />
    </GameStoreProvider>
  )
  act(() => {
    run(store, 'git config --global user.name "Ada Lovelace"')
    run(store, 'git config --global user.email ada@inkwell.example')
  })
  return store
}

function run(store: GameStore, line: string) {
  store.getState().dispatch({ type: 'runCommand', line })
}

const act_ = (store: GameStore, ...lines: string[]) =>
  act(() => lines.forEach((line) => run(store, line)))

function append(store: GameStore, text: string) {
  act(() => {
    const local = store.getState().game.git.local!
    store.getState().dispatch({
      type: 'saveFile',
      path: 'team.md',
      content: `${local.working['team.md']}${text}\n`,
    })
  })
}

const said = () => screen.getByText(/^On /).textContent
const tokens = (from: string) => document.querySelectorAll(`[data-from="${from}"]`).length
const flush = () => act(() => void vi.advanceTimersByTime(1))

describe('Where are my changes?', () => {
  it('follows a change from the editor all the way to GitNub’s main and back', () => {
    const store = setup()
    expect(said()).toBe(
      'On main: 0 changes in your working files, 0 changes staged, 0 commits waiting to push, no merge request, you have everything on GitNub’s main.'
    )

    // Typing in the Editor counts before it's even saved.
    act(() => {
      const local = store.getState().game.git.local!
      store.getState().dispatch({
        type: 'editBuffer',
        path: 'team.md',
        content: `${local.working['team.md']}- Ada\n`,
      })
    })
    expect(said()).toContain('1 change in your working files')

    append(store, '- Ada')
    act_(store, 'git switch -c ada-list')
    expect(said()).toMatch(/^On ada-list: 1 change in your working files, 0 changes staged/)

    act_(store, 'git add team.md')
    expect(said()).toContain('0 changes in your working files, 1 change staged')
    flush()
    expect(tokens('working')).toBe(1)

    act_(store, 'git commit -m "Add Ada"')
    append(store, '- (she/they)')
    act_(store, 'git commit -am "Add pronouns"')
    expect(said()).toContain('0 changes staged, 2 commits waiting to push')

    act_(store, 'git push -u origin ada-list')
    expect(said()).toContain(
      '0 commits waiting to push, your branch is on GitNub with no merge request yet'
    )

    act(() =>
      store
        .getState()
        .dispatch({ type: 'openPullRequest', slug: SLUG, branch: 'ada-list', title: 'Add Ada' })
    )
    expect(said()).toContain('merge request !4 waiting for review')

    // A coworker's merge request lands first.
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'remoteCommit',
          slug: SLUG,
          author: 'sam',
          message: 'Fix a typo\n\nSee merge request inkwell/docs-site!5',
          edits: [{ kind: 'appendLine', path: 'docs/welcome.md', text: 'Hello.' }],
        },
      })
    )
    expect(said()).toContain('merge request !4 someone else got there first')
    expect(said()).toContain('GitNub’s main has 1 commit you don’t have yet')

    act(() => store.getState().dispatch({ type: 'updateBranch', slug: SLUG, number: 4 }))
    expect(said()).toContain('merge request !4 waiting for review')
    expect(said()).toContain('you have everything on GitNub’s main')

    // Merge, squashing: two commits become one on main.
    flush()
    act(() => store.getState().dispatch({ type: 'mergePullRequest', slug: SLUG, number: 4 }))
    expect(said()).toContain('merge request !4 merged')
    expect(said()).toContain('GitNub’s main has 1 commit you don’t have yet')
    flush()
    expect(tokens('pr')).toBe(2)

    act_(store, 'git switch main', 'git pull')
    expect(said()).toBe(
      'On main: 0 changes in your working files, 0 changes staged, 0 commits waiting to push, no merge request, you have everything on GitNub’s main.'
    )

    // Tokens are gone once they've arrived.
    act(() => void vi.advanceTimersByTime(1500))
    expect(tokens('pr')).toBe(0)
  })

  it('once the chapter is done, new commits on main are for next time, not a missed step', () => {
    for (const finished of [false, true]) {
      const store = setup({ finished })
      act(() =>
        store.getState().dispatch({
          type: 'applyEffect',
          effect: {
            type: 'remoteCommit',
            slug: SLUG,
            author: 'sam',
            message: 'Fix a typo',
            edits: [{ kind: 'appendLine', path: 'docs/welcome.md', text: 'Hello.' }],
          },
        })
      )
      const main = screen.getByRole('button', { name: /^GitNub main/ })
      if (finished) {
        expect(main).toHaveTextContent('1 new commit · pull next time')
        expect(main.className).not.toMatch(/active/)
      } else {
        expect(main).toHaveTextContent('1 new commit for you')
        expect(main.className).toMatch(/active/)
      }
      cleanup()
    }
  })

  it('explains a box and what moves changes on, when clicked', () => {
    setup()
    const box = screen.getByRole('button', { name: /^Staged/ })
    expect(box).toHaveAttribute('aria-expanded', 'false')
    act(() => void fireEvent.click(box))
    expect(box).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/picked for your next commit/)).toBeInTheDocument()
    expect(screen.getByText(/Next:/)).toHaveTextContent('git commit -m "What I changed"')
  })
})
