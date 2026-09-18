import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createGameConfig } from '../../content'
import { createGameStore, type GameStore, type StorageLike } from '../../store'
import { App } from './App'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

type TabName = 'flack' | 'gitnub' | 'editor'

function renderApp(hash = '', tabs?: TabName[]) {
  window.location.hash = hash
  const store = createGameStore({ config: createGameConfig(), storage: noStorage })
  if (tabs)
    store.setState((s) => ({ game: { ...s.game, ui: { ...s.game.ui, unlockedTabs: tabs } } }))
  render(<App store={store} />)
  return store
}

function unlock(store: GameStore, tabs: TabName[]) {
  act(() => {
    store.setState((s) => ({ game: { ...s.game, ui: { ...s.game.ui, unlockedTabs: tabs } } }))
  })
}

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  window.location.hash = ''
})

describe('App shell', () => {
  it('says so when a saved game couldn’t be loaded, until dismissed', async () => {
    const oldSave: StorageLike = { ...noStorage, getItem: () => '{"version":0}' }
    render(<App store={createGameStore({ config: createGameConfig(), storage: oldSave })} />)
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('your saved progress couldn’t be loaded')
    await userEvent.click(within(notice).getByRole('button', { name: 'OK' }))
    expect(screen.queryByText(/saved progress couldn’t be loaded/)).not.toBeInTheDocument()
  })

  it('has labelled landmarks for the three panels', () => {
    renderApp()
    expect(screen.getByRole('complementary', { name: 'Instructions' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Desktop' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeInTheDocument()
  })

  it('opens on the Flack tab and puts it in the URL', async () => {
    renderApp()
    expect(screen.getByRole('tab', { name: /Flack/ })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.hash).toBe('#/flack/docs-team')
  })

  it('a deep link to GitNub opens the GitNub tab', async () => {
    const store = renderApp('#/gitnub/inkwell/docs-site', ['flack', 'gitnub'])
    expect(await screen.findByRole('tab', { name: 'GitNub' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(store.getState().game.ui.activeTab).toBe('gitnub')
    expect(window.location.hash).toBe('#/gitnub/inkwell/docs-site')
  })

  it('a locked tab explains itself and cannot be opened', async () => {
    const user = userEvent.setup()
    const store = renderApp()
    const editor = screen.getByRole('tab', { name: /Editor/ })
    expect(editor).toHaveAttribute('aria-disabled', 'true')
    expect(editor).toHaveAttribute('title', "You'll unlock this soon")
    expect(editor).toHaveAccessibleName(/you'll unlock this soon/)
    await user.click(editor)
    expect(store.getState().game.ui.activeTab).toBe('flack')
    expect(window.location.hash).toBe('#/flack/docs-team')
  })

  it('a deep link to a locked tab falls back to the active tab', async () => {
    renderApp('#/editor/team.md')
    expect(await screen.findByRole('tab', { name: /Flack/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(window.location.hash).toBe('#/flack/docs-team')
  })

  it('tabs follow the ARIA tabs pattern with arrow keys', async () => {
    const user = userEvent.setup()
    const store = renderApp()
    unlock(store, ['flack', 'gitnub', 'editor'])
    const tablist = screen.getByRole('tablist', { name: 'Apps' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])

    await user.click(tabs[0])
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'GitNub' })).toHaveFocus()
    expect(store.getState().game.ui.activeTab).toBe('gitnub')
    await user.keyboard('{End}')
    expect(store.getState().game.ui.activeTab).toBe('editor')
    await user.keyboard('{ArrowRight}')
    expect(store.getState().game.ui.activeTab).toBe('flack')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-flack')
  })

  it('follows the story when it switches tabs', async () => {
    const store = renderApp()
    unlock(store, ['flack', 'gitnub', 'editor'])
    act(() => store.getState().dispatch({ type: 'openTab', tab: 'editor' }))
    expect(window.location.hash).toBe('#/editor')
  })

  it('shows an unread badge on Flack', async () => {
    const store = renderApp()
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        // #general isn't the channel on screen, so it stays unread.
        effect: { type: 'flackMessage', channel: 'general', from: 'jordan', text: 'Welcome!' },
      })
    )
    expect(screen.getByRole('tab', { name: /Flack/ })).toHaveAccessibleName('Flack, 1 unread')
  })

  it('includes the small-screen notice', () => {
    renderApp()
    expect(screen.getByRole('note')).toHaveTextContent('Flack works best on a laptop or desktop')
  })
})
