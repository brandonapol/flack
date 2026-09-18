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

/** Creates the merge request through the UI, the way a learner would. */
function openPr(store: GameStore) {
  click(screen.getByRole('link', { name: 'Create merge request' }))
  click(screen.getByRole('button', { name: 'Create merge request' }))
  return findPullRequest(remote(store), 4)!
}

describe('creating a merge request', () => {
  it('the repo page nudges you after a branch push', () => {
    setup(`/gitnub/${SLUG}`)
    const prompt = screen.getByText(/You pushed to/)
    expect(prompt).toHaveTextContent('You pushed to ada-team-list just now')
    expect(screen.getByRole('link', { name: 'Create merge request' })).toBeInTheDocument()
  })

  it('the form is prefilled from the last commit and creates the MR', () => {
    const store = setup(`/gitnub/${SLUG}`)
    click(screen.getByRole('link', { name: 'Create merge request' }))
    expect(screen.getByRole('heading', { name: 'New merge request' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Add Ada Lovelace to the team list'
    )
    click(screen.getByRole('button', { name: 'Create merge request' }))

    const pr = findPullRequest(remote(store), 4)
    expect(pr).toMatchObject({ branch: 'ada-team-list', base: 'main', status: 'open' })
    expect(probe.path).toBe(`/gitnub/${SLUG}/pull/4`)
    expect(
      screen.getByRole('heading', { name: /Add Ada Lovelace to the team list !4/ })
    ).toBeInTheDocument()
    expect(screen.getByText(/requested to merge/)).toHaveTextContent(
      'requested to merge ada-team-list into main'
    )
  })

  it('the banner goes away once the branch has an MR', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    click(screen.getByRole('link', { name: 'docs-site' }))
    expect(screen.queryByText(/You pushed to/)).not.toBeInTheDocument()
  })
})

describe('the merge request page', () => {
  it('shows a review once a teammate has looked', () => {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    expect(screen.getByText(/Approval is optional/)).toBeInTheDocument()
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
    expect(screen.getByText('approved this merge request')).toBeInTheDocument()
    expect(screen.getByText('Welcome aboard! 🎉')).toBeInTheDocument()
    expect(screen.getByText(/Approved. Ready to merge!/)).toBeInTheDocument()
  })

  it('lists the commits and the files changed', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    click(screen.getByRole('tab', { name: /Commits 1/ }))
    const commits = screen.getByRole('list')
    expect(within(commits).getByText('Add Ada Lovelace to the team list')).toBeInTheDocument()
    expect(commits).toHaveTextContent('Ada Lovelace committed')
    click(screen.getByRole('tab', { name: /Changes 1/ }))
    const diff = screen.getByRole('table', { name: 'Changes to team.md' })
    expect(diff).toHaveTextContent('- Ada Lovelace')
  })

  it('Merge squashes into one commit on main, as previewed, and deletes the source branch', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    const before = log(remote(store).commits, remote(store).branches.main).length

    expect(screen.getByRole('checkbox', { name: /Squash commits/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Squash commits/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Delete source branch' })).toBeChecked()
    expect(screen.getByText('1 commit will be added to main.')).toBeInTheDocument()
    const preview = screen.getByText(/See merge request inkwell\/docs-site!4/)
    click(screen.getByRole('button', { name: 'Merge' }))

    const after = log(remote(store).commits, remote(store).branches.main)
    expect(after).toHaveLength(before + 1)
    expect(after[0].message).toBe(preview.textContent)
    expect(after[0].author.name).toBe('Ada Lovelace')
    expect(findPullRequest(remote(store), 4)).toMatchObject({ status: 'merged' })
    expect(screen.getByText(/The changes were merged into/)).toBeInTheDocument()
    expect(remote(store).branches['ada-team-list']).toBeUndefined()
    expect(screen.getByText(/The source branch has been deleted/)).toBeInTheDocument()
  })

  it('with Delete source branch unticked, the branch stays until you delete it', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    click(screen.getByRole('checkbox', { name: 'Delete source branch' }))
    click(screen.getByRole('button', { name: 'Merge' }))
    expect(remote(store).branches['ada-team-list']).toBeDefined()
    click(screen.getByRole('button', { name: 'Delete source branch' }))
    expect(remote(store).branches['ada-team-list']).toBeUndefined()
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
          message: 'Add Sam Rivera to the team list\n\nSee merge request inkwell/docs-site!5',
          edits: [{ kind: 'appendLine', path: 'docs/welcome.md', text: 'Hello from Sam.' }],
        },
      })
    )
  }

  it('blocks merging until the source branch is rebased', () => {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    samMerges(store)
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('needs-update')
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled()

    click(screen.getByRole('button', { name: 'Rebase' }))
    expect(screen.getByRole('button', { name: 'Merge' })).toBeEnabled()
  })

  it('Rebase replays the commits and clears the banner', () => {
    const store = setup(`/gitnub/${SLUG}`)
    const pr = openPr(store)
    samMerges(store)
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('needs-update')
    expect(
      screen.getAllByText(
        'Merge blocked: the source branch must be rebased onto the target branch.'
      ).length
    ).toBeGreaterThan(0)

    const before = remote(store).branches['ada-team-list']
    click(screen.getByRole('button', { name: 'Rebase' }))

    expect(findPullRequest(remote(store), pr.number)?.status).toBe('open')
    expect(remote(store).branches['ada-team-list']).not.toBe(before)
    expect(screen.queryByText(/must be rebased/)).not.toBeInTheDocument()
    expect(screen.getByText('Source branch rebased')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/sit on top of the latest main/)

    // The learner's clone came along, so the branch there matches GitNub.
    const local = store.getState().game.git.local!
    expect(local.branches['ada-team-list']).toBe(remote(store).branches['ada-team-list'])
    expect(local.working['docs/welcome.md']).toContain('Hello from Sam.')
  })
})

describe('a merge request with conflicts', () => {
  function samTakesTheSameSpot(store: GameStore) {
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'remoteCommit',
          slug: SLUG,
          author: 'sam',
          message: 'Add Sam Rivera to the team list\n\nSee merge request inkwell/docs-site!5',
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

    expect(
      screen.getByRole('note', { name: 'Resolve conflicts: 1 file between ada-team-list and main' })
    ).toBeInTheDocument()
    expect(screen.getByText('Merge blocked: merge conflicts must be resolved.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Conflicting files' })).getByText('team.md')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Rebase' })).not.toBeInTheDocument()

    act(() =>
      store.getState().dispatch({ type: 'resolveConflicts', slug: SLUG, number: pr.number })
    )
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('open')
    expect(
      screen.queryByRole('note', {
        name: 'Resolve conflicts: 1 file between ada-team-list and main',
      })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeEnabled()
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
          message: 'Add Sam Rivera to the team list\n\nSee merge request inkwell/docs-site!5',
          edits: [{ kind: 'appendLine', path: 'team.md', text: '- Sam Rivera' }],
        },
      })
    )
    return { store, pr }
  }

  it('previews each choice, nudges when one drops a change, and shows the markers', () => {
    conflicted()
    const resolve = screen.getByRole('button', { name: 'Commit to source branch' })
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

  it('Commit to source branch merges main in with the choice, and Undo takes it back', () => {
    const { store, pr } = conflicted()
    click(screen.getByRole('button', { name: 'Keep theirs' }))
    click(screen.getByRole('button', { name: 'Commit to source branch' }))
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('open')
    const tip = remote(store).branches['ada-team-list']
    expect(remote(store).commits[tip].message).toBe("Merge branch 'main' into ada-team-list")
    expect(remote(store).commits[tip].tree['team.md']).not.toContain('Ada Lovelace')
    expect(screen.getByText('Conflicts resolved')).toBeInTheDocument()

    click(screen.getByRole('button', { name: 'Undo and choose again' }))
    expect(findPullRequest(remote(store), pr.number)?.status).toBe('has-conflicts')
    expect(
      screen.getByRole('note', { name: 'Resolve conflicts: 1 file between ada-team-list and main' })
    ).toBeInTheDocument()
  })
})

describe('the merge requests list', () => {
  it('shows open and merged merge requests', () => {
    const store = setup(`/gitnub/${SLUG}`)
    openPr(store)
    click(screen.getByRole('link', { name: /All merge requests/ }))
    expect(
      screen.getByRole('heading', { name: 'Merge requests · 1 open · 0 merged' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Add Ada Lovelace to the team list' })
    ).toBeInTheDocument()
  })
})
