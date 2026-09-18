import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import { GitNub } from './GitNub'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function setup(path: string) {
  const store = createGameStore({ config: createGameConfig(), storage: noStorage })
  const dispatch = vi.fn(store.getState().dispatch)
  store.setState({ dispatch })
  render(
    <GameStoreProvider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/gitnub/*" element={<GitNub />} />
        </Routes>
      </MemoryRouter>
    </GameStoreProvider>
  )
  return { store, dispatch, user: userEvent.setup() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GitNub org page', () => {
  it('lists the three repos, with the archived one marked', () => {
    setup('/gitnub')
    const list = screen.getByRole('list')
    const cards = within(list).getAllByRole('listitem')
    expect(cards.map((card) => within(card).getByRole('link').textContent)).toEqual([
      'docs-site',
      'website',
      'old-wiki',
    ])
    expect(cards[2]).toHaveTextContent('Public archive')
    expect(cards[0]).toHaveTextContent('Inkwell product documentation')
    expect(cards[0]).toHaveTextContent(/Updated 3 days ago/)
  })
})

describe('GitNub repo page', () => {
  it('shows files, the latest commit, the commit count and the README, and emits viewRepo', () => {
    const { dispatch } = setup('/gitnub/inkwell/docs-site')
    const table = screen.getByRole('table', { name: 'Files in docs-site' })
    expect(
      within(table)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['docs', 'README.md', 'team.md'])
    expect(screen.getByText('4 commits')).toBeInTheDocument()
    expect(
      screen.getByText('Explain branches and pull requests in the README (#3)', {
        selector: 'span',
      })
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'README' })).getByRole('heading', {
        name: 'Inkwell Docs',
      })
    ).toBeInTheDocument()
    expect(dispatch).toHaveBeenCalledWith({ type: 'viewRepo', slug: 'inkwell/docs-site' })
  })

  it('the Code button copies the clone address and emits cloneUrlCopied', async () => {
    const { dispatch, user } = setup('/gitnub/inkwell/docs-site')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    await user.click(screen.getByRole('button', { name: /Code/ }))
    const popover = screen.getByRole('dialog', { name: 'Clone this repository' })
    expect(within(popover).getByRole('textbox', { name: 'Clone address' })).toHaveValue(
      'https://gitnub.com/inkwell/docs-site.git'
    )
    await user.click(within(popover).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('https://gitnub.com/inkwell/docs-site.git')
    expect(dispatch).toHaveBeenCalledWith({ type: 'copyCloneUrl', slug: 'inkwell/docs-site' })
    expect(within(popover).getByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('Escape closes the clone dialog and puts focus back on the Code button', async () => {
    const { user } = setup('/gitnub/inkwell/docs-site')
    await user.click(screen.getByRole('button', { name: /Code/ }))
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Clone this repository' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Code/ })).toHaveFocus()
  })

  it('selects the address when the clipboard is unavailable', async () => {
    const { dispatch, user } = setup('/gitnub/inkwell/docs-site')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    await user.click(screen.getByRole('button', { name: /Code/ }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'copyCloneUrl', slug: 'inkwell/docs-site' })
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('opens folders', async () => {
    const { user } = setup('/gitnub/inkwell/docs-site')
    await user.click(screen.getByRole('link', { name: 'docs' }))
    expect(
      within(screen.getByRole('table', { name: 'Files in docs' }))
        .getAllByRole('link')
        .map((l) => l.textContent)
    ).toEqual(['style-guide.md', 'welcome.md'])
  })

  it('updates when a coworker pushes', () => {
    const { store } = setup('/gitnub/inkwell/docs-site/commits')
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'remoteCommit',
          slug: 'inkwell/docs-site',
          author: 'sam',
          message: 'Add Sam Rivera to team list (#4)',
          edits: [{ kind: 'appendLine', path: 'team.md', text: '- Sam Rivera' }],
        },
      })
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('Add Sam Rivera to team list (#4)')
    expect(rows[0]).toHaveTextContent('Sam Rivera committed just now')
  })
})

describe('GitNub file view', () => {
  it('renders Markdown, with a Code toggle for the raw lines', async () => {
    const { store, user } = setup('/gitnub/inkwell/docs-site/blob/main/team.md')
    expect(screen.getByRole('heading', { name: 'Docs team' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Code' }))
    const code = screen.getByRole('table', { name: 'team.md' })
    expect(within(code).getAllByRole('row')).toHaveLength(6)

    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'remoteCommit',
          slug: 'inkwell/docs-site',
          author: 'sam',
          message: 'Add Sam',
          edits: [{ kind: 'appendLine', path: 'team.md', text: '- Sam Rivera' }],
        },
      })
    )
    expect(within(screen.getByRole('table', { name: 'team.md' })).getAllByRole('row')).toHaveLength(
      7
    )
    expect(screen.getByRole('table', { name: 'team.md' })).toHaveTextContent('- Sam Rivera')
  })
})

describe('decoys', () => {
  it('the archived repo says it is read-only and offers no Code button', () => {
    setup('/gitnub/inkwell/old-wiki')
    expect(screen.getByRole('note')).toHaveTextContent(
      'This repository has been archived by the owner. It is now read-only.'
    )
    expect(screen.queryByRole('button', { name: /Code/ })).not.toBeInTheDocument()
  })

  it('the website repo renders a minimal page', () => {
    setup('/gitnub/inkwell/website')
    expect(screen.getByRole('link', { name: 'index.html' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Code/ })).toBeInTheDocument()
  })

  it('unknown pages say so', () => {
    setup('/gitnub/inkwell/nope')
    expect(screen.getByRole('heading', { name: '404: nothing here' })).toBeInTheDocument()
  })
})
