import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'

import { createGameConfig } from '../../content'
import { log } from '../../engine/git/repo'
import { findPullRequest } from '../../engine/git/pullRequests'
import { createGameStore, GameStoreProvider, type GameStore, type StorageLike } from '../../store'
import { GitNub } from './GitNub'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
const SLUG = 'inkwell/docs-site'
const probe = { path: '' }

function LocationProbe() {
  const { pathname } = useLocation()
  useEffect(() => {
    probe.path = pathname
  }, [pathname])
  return null
}

const click = (element: HTMLElement) => act(() => void fireEvent.click(element))
const remote = (store: GameStore) => store.getState().game.git.remotes[SLUG]

/** Does what Chapter 3 asks of the learner: branch, commit, push the branch. */
function pushBranch(store: GameStore) {
  const run = (line: string) => store.getState().dispatch({ type: 'runCommand', line })
  act(() => {
    run('git clone https://gitnub.com/inkwell/docs-site.git')
    run('cd docs-site')
    run('git config --global user.name "Ada Lovelace"')
    run('git config --global user.email ada@inkwell.example')
    run('git switch -c ada-team-list')
  })
  act(() => {
    const local = store.getState().game.git.local!
    store.getState().dispatch({
      type: 'saveFile',
      path: 'team.md',
      content: `${local.working['team.md']}- Ada Lovelace\n`,
    })
  })
  act(() => {
    run('git commit -am "Add Ada Lovelace to the team list"')
    run('git push -u origin ada-team-list')
  })
}

function setup(path: string) {
  const store = createGameStore({ config: createGameConfig(), storage: noStorage })
  pushBranch(store)
  render(
    <GameStoreProvider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="/gitnub/*" element={<GitNub />} />
        </Routes>
      </MemoryRouter>
    </GameStoreProvider>
  )
  return store
}

/** Opens the PR through the UI, the way a learner would. */
function openPr(store: GameStore) {
  click(screen.getByRole('link', { name: /Compare & pull request/ }))
  click(screen.getByRole('button', { name: 'Create pull request' }))
  return findPullRequest(remote(store), 4)!
}

describe('opening a pull request', () => {
  it('the repo page nudges you after a branch push', () => {
    setup(`/gitnub/${SLUG}`)
    const prompt = screen.getByText(/had recent pushes/)
    expect(prompt).toHaveTextContent('ada-team-list')
    expect(screen.getByRole('link', { name: /Compare & pull request/ })).toBeInTheDocument()
  })

  it('the form is prefilled from the last commit and creates the PR', () => {
    const store = setup(`/gitnub/${SLUG}`)
    click(screen.getByRole('link', { name: /Compare & pull request/ }))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Add Ada Lovelace to the team list'
    )
    click(screen.getByRole('button', { name: 'Create pull request' }))

    const pr = findPullRequest(remote(store), 4)
    expect(pr).toMatchObject({ branch: 'ada-team-list', base: 'main', status: 'open' })
    expect(probe.path).toBe(`/gitnub/${SLUG}/pull/4`)
    expect(
      screen.getByRole('heading', { name: /Add Ada Lovelace to the team list #4/ })
    ).toBeInTheDocument()
    expect(screen.getByText(/wants to merge 1 commit into/)).toBeInTheDocument()
  })

  it('the banner goes away once the branch has a PR', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    click(screen.getByRole('link', { name: 'docs-site' }))
    expect(screen.queryByText(/had recent pushes/)).not.toBeInTheDocument()
  })
})

describe('the pull request page', () => {
  it('shows a review once a teammate has looked', () => {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    expect(screen.getByText(/Waiting for a review/)).toBeInTheDocument()
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'reviewPullRequest',
          slug: SLUG,
          number: pr.number,
          author: 'robin',
          body: 'Welcome aboard! 🎉',
          approve: true,
        },
      })
    )
    expect(screen.getByText('approved these changes')).toBeInTheDocument()
    expect(screen.getByText('Welcome aboard! 🎉')).toBeInTheDocument()
    expect(screen.getByText(/Changes approved/)).toBeInTheDocument()
  })

  it('lists the commits and the files changed', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    click(screen.getByRole('tab', { name: /Commits 1/ }))
    const commits = screen.getByRole('list')
    expect(within(commits).getByText('Add Ada Lovelace to the team list')).toBeInTheDocument()
    expect(commits).toHaveTextContent('Ada Lovelace committed')
    click(screen.getByRole('tab', { name: /Files changed 1/ }))
    const diff = screen.getByRole('table', { name: 'Changes to team.md' })
    expect(diff).toHaveTextContent('- Ada Lovelace')
  })

  it('squash merge previews the message, makes one commit on main, and offers to delete the branch', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    const before = log(remote(store).commits, remote(store).branches.main).length

    click(screen.getByRole('button', { name: 'Squash and merge' }))
    const preview = screen.getByText(/Add Ada Lovelace to the team list \(#4\)/)
    expect(screen.getByText(/will become/)).toHaveTextContent(
      'Your 1 commit will become 1 commit on main'
    )
    click(screen.getByRole('button', { name: 'Confirm squash and merge' }))

    const after = log(remote(store).commits, remote(store).branches.main)
    expect(after).toHaveLength(before + 1)
    expect(after[0].message).toBe(preview.textContent)
    expect(after[0].author.name).toBe('Ada Lovelace')
    expect(findPullRequest(remote(store), 4)).toMatchObject({ status: 'merged' })
    expect(screen.getAllByText(/Merged/).length).toBeGreaterThan(0)

    click(screen.getByRole('button', { name: 'Delete branch' }))
    expect(remote(store).branches['ada-team-list']).toBeUndefined()
    expect(screen.getByText(/Branch deleted/)).toBeInTheDocument()
  })
})

describe('an out-of-date branch', () => {
  function samMerges(store: GameStore) {
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'remoteCommit',
          slug: SLUG,
          author: 'sam',
          message: 'Add Sam Rivera to the team list (#5)',
          edits: [{ kind: 'appendLine', path: 'docs/welcome.md', text: 'Hello from Sam.' }],
        },
      })
    )
  }

  it('trying to merge an out-of-date branch explains it needs updating first', () => {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    samMerges(store)
    const mainBefore = remote(store).branches.main
    click(screen.getByRole('button', { name: 'Squash and merge' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Update the branch first')
    expect(
      screen.queryByRole('button', { name: 'Confirm squash and merge' })
    ).not.toBeInTheDocument()
    expect(remote(store).branches.main).toBe(mainBefore)
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('needs-update')

    click(screen.getByRole('button', { name: 'Update branch' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    click(screen.getByRole('button', { name: 'Squash and merge' }))
    expect(screen.getByRole('button', { name: 'Confirm squash and merge' })).toBeInTheDocument()
  })

  it('Update branch replays the commits and clears the banner', () => {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    samMerges(store)
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('needs-update')
    expect(screen.getByText('This branch is out of date with the base branch')).toBeInTheDocument()

    const before = remote(store).branches['ada-team-list']
    click(screen.getByRole('button', { name: 'Update branch' }))

    expect(findPullRequest(remote(store), pr.number)?.status).toBe('open')
    expect(remote(store).branches['ada-team-list']).not.toBe(before)
    expect(
      screen.queryByText('This branch is out of date with the base branch')
    ).not.toBeInTheDocument()
    expect(screen.getByText('Branch updated')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/sit on top of the latest main/)

    // The learner's clone came along, so the branch there matches GitNub.
    const local = store.getState().game.git.local!
    expect(local.branches['ada-team-list']).toBe(remote(store).branches['ada-team-list'])
    expect(local.working['docs/welcome.md']).toContain('Hello from Sam.')
  })
})

describe('a pull request with conflicts', () => {
  function samTakesTheSameSpot(store: GameStore) {
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'remoteCommit',
          slug: SLUG,
          author: 'sam',
          message: 'Add Sam Rivera to the team list (#5)',
          edits: [{ kind: 'appendLine', path: 'team.md', text: '- Sam Rivera' }],
        },
      })
    )
  }

  it('says so, lists the files, and blocks merging until they are resolved', () => {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    samTakesTheSameSpot(store)
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('has-conflicts')

    expect(screen.getByText('This branch has conflicts that must be resolved')).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Conflicting files' })).getByText('team.md')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Squash and merge' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Update branch' })).not.toBeInTheDocument()

    act(() =>
      store.getState().dispatch({ type: 'resolveConflicts', slug: SLUG, number: pr.number })
    )
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('open')
    expect(
      screen.queryByText('This branch has conflicts that must be resolved')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Squash and merge' })).toBeEnabled()
  })
})

describe('resolving a conflict on GitNub', () => {
  function conflicted() {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'remoteCommit',
          slug: SLUG,
          author: 'sam',
          message: 'Add Sam Rivera to the team list (#5)',
          edits: [{ kind: 'appendLine', path: 'team.md', text: '- Sam Rivera' }],
        },
      })
    )
    return { store, pr }
  }

  it('previews each choice, nudges when one drops a change, and shows the markers', () => {
    conflicted()
    const resolve = screen.getByRole('button', { name: 'Mark as resolved' })
    expect(resolve).toBeDisabled()
    const choices = screen.getByRole('group', { name: 'Resolve team.md' })

    click(within(choices).getByRole('button', { name: 'Keep mine' }))
    expect(within(choices).getByRole('button', { name: 'Keep mine' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByText(/That drops what’s on main/)).toHaveTextContent('- Sam Rivera')
    expect(resolve).toBeEnabled()

    click(within(choices).getByRole('button', { name: 'Keep both' }))
    expect(screen.queryByText(/That drops/)).not.toBeInTheDocument()
    expect(
      screen.getByText('- Ada Lovelace - Sam Rivera', { normalizer: (t) => t.replace(/\n/g, ' ') })
    ).toBeInTheDocument()

    expect(screen.getByText(/<<<<<<< ada-team-list/)).toHaveTextContent('>>>>>>> main')
  })

  it('Mark as resolved merges main in with the choice, and Undo takes it back', () => {
    const { store, pr } = conflicted()
    click(screen.getByRole('button', { name: 'Keep theirs' }))
    click(screen.getByRole('button', { name: 'Mark as resolved' }))
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('open')
    const tip = remote(store).branches['ada-team-list']
    expect(remote(store).commits[tip].message).toBe("Merge branch 'main' into ada-team-list")
    expect(remote(store).commits[tip].tree['team.md']).not.toContain('Ada Lovelace')
    expect(screen.getByText('Conflicts resolved')).toBeInTheDocument()

    click(screen.getByRole('button', { name: 'Undo and choose again' }))
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('has-conflicts')
    expect(screen.getByText('This branch has conflicts that must be resolved')).toBeInTheDocument()
  })
})

describe('the pull requests list', () => {
  it('shows open and merged pull requests', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    click(screen.getByRole('link', { name: /All pull requests/ }))
    expect(screen.getByRole('heading', { name: '1 open · 0 merged' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Add Ada Lovelace to the team list' })
    ).toBeInTheDocument()
  })
})
