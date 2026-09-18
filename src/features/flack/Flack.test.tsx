import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toyConfig } from '../../engine/story/__fixtures__/toyChapter'
import { createGameStore, GameStoreProvider, type GameStore, type StorageLike } from '../../store'
import { Flack } from './Flack'
import { FlackNotifications } from './FlackNotifications'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

const timers = {
  now: () => Date.now(),
  setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function setup(path = '/flack') {
  const store = createGameStore({ config: toyConfig(), storage: noStorage, timers })
  render(
    <GameStoreProvider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <FlackNotifications />
        <Routes>
          <Route path="/flack/:channel?" element={<Flack />} />
          <Route path="/editor/*" element={<p>Editor</p>} />
        </Routes>
      </MemoryRouter>
    </GameStoreProvider>
  )
  return { store }
}

/** Fake timers and userEvent don't mix well here, so clicks go through fireEvent. */
function click(element: HTMLElement) {
  act(() => {
    fireEvent.click(element)
  })
}

function say(store: GameStore, channel: string, text: string, from = 'sam') {
  act(() =>
    store
      .getState()
      .dispatch({ type: 'applyEffect', effect: { type: 'flackMessage', channel, from, text } })
  )
}

/** Plays the toy chapter far enough that Sam's delayed reply is scheduled. */
function triggerDelayedMessage(store: GameStore) {
  act(() => {
    store.getState().dispatch({ type: 'runCommand', line: 'echo hello' })
    store.getState().dispatch({ type: 'saveFile', path: 'team.md', content: 'x\n' })
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Flack', () => {
  it('shows the workspace, channels and DMs, and opens the default channel', () => {
    setup()
    const sidebar = screen.getByRole('navigation', { name: 'Channels' })
    expect(sidebar).toHaveTextContent('Inkwell')
    expect(within(sidebar).getByRole('button', { name: /docs-team/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(within(sidebar).getByRole('button', { name: /Robin Okafor/ })).toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent('Hi!')
  })

  it('shows messages for the channel you are in, with author and time', () => {
    const { store } = setup()
    say(store, 'dm-robin', 'Ask me anything', 'robin')
    expect(screen.getByRole('log')).not.toHaveTextContent('Ask me anything')
    const log = screen.getByRole('log')
    expect(within(log).getByText('Jordan Lee')).toBeInTheDocument()
    expect(log).toHaveTextContent(/\d:\d\d (AM|PM)/)
  })

  it('switching channel in the sidebar changes the view and marks it read', () => {
    const { store } = setup()
    say(store, 'dm-robin', 'Ask me anything', 'robin')
    expect(screen.getByRole('button', { name: /Robin Okafor, 1 unread/ })).toBeInTheDocument()

    const sidebar = screen.getByRole('navigation', { name: 'Channels' })
    click(within(sidebar).getByRole('button', { name: /Robin Okafor/ }))
    expect(screen.getByRole('log')).toHaveTextContent('Ask me anything')
    expect(store.getState().game.flack.activeChannel).toBe('dm-robin')
    expect(screen.queryByText(/, 1 unread/)).not.toBeInTheDocument()
  })

  it('renders `code` and **bold** without raw HTML', () => {
    const { store } = setup()
    say(store, 'docs-team', 'Run `git status` to **check**. <b>nope</b>')
    const log = screen.getByRole('log')
    expect(within(log).getByText('git status').tagName).toBe('CODE')
    expect(within(log).getByText('check').tagName).toBe('STRONG')
    expect(log.innerHTML).not.toContain('<b>')
  })

  it('shows a typing indicator while a message is on its way', () => {
    const { store } = setup()
    triggerDelayedMessage(store)
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByText(/Sam Rivera is typing…/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent('Nice, Ada Lovelace!')
  })

  it('quick replies post your message once and then disappear', () => {
    const { store } = setup()
    triggerDelayedMessage(store)
    act(() => vi.advanceTimersByTime(3000))
    const reply = screen.getByRole('button', { name: '👋' })
    click(reply)
    expect(screen.queryByRole('button', { name: '👋' })).not.toBeInTheDocument()
    const log = screen.getByRole('log')
    expect(within(log).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(store.getState().game.flack.messages.filter((m) => m.from === 'player')).toHaveLength(1)
  })

  it('has a disabled composer that explains itself', () => {
    setup()
    const composer = screen.getByRole('textbox', { name: /Message box/ })
    expect(composer).toBeDisabled()
    expect(composer).toHaveAttribute('placeholder', 'Use the reply buttons for now')
  })

  it('pops a notification for a message in another channel, and opens it when clicked', () => {
    const { store } = setup()
    say(store, 'dm-robin', 'Psst, over here', 'robin')
    const toast = screen.getByRole('button', { name: /Psst, over here/ })
    expect(toast).toHaveTextContent('Robin Okafor')
    click(toast)
    expect(store.getState().game.flack.activeChannel).toBe('dm-robin')
    expect(screen.queryByRole('button', { name: /Psst, over here/ })).not.toBeInTheDocument()
  })

  it('does not notify about the channel you are already reading', () => {
    const { store } = setup()
    say(store, 'docs-team', 'Right here')
    expect(screen.queryByRole('button', { name: /Right here/ })).not.toBeInTheDocument()
  })
})

describe('Ask Robin', () => {
  it('offers this chapter’s questions in the DM, and answers when asked', () => {
    const { store } = setup('/flack/dm-robin')
    const panel = screen.getByRole('list', { name: 'Questions you can ask Robin' })
    const question = within(panel).getByRole('button', { name: 'What is Git?' })
    click(question)
    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('What is Git?')
    expect(log).toHaveTextContent('A time machine for files.')
    expect(
      store
        .getState()
        .game.flack.messages.slice(-2)
        .map((m) => m.from)
    ).toEqual(['player', 'robin'])
  })

  it('offers the Commit Lab under an answer that has one', () => {
    const { store } = setup('/flack/docs-team')
    act(() =>
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'flackMessage',
          channel: 'docs-team',
          from: 'robin',
          text: 'Rebase replays your commits.',
          lab: 'sandbox',
        },
      })
    )
    const dispatch = vi.fn()
    act(() => store.setState({ dispatch }))
    click(screen.getByRole('button', { name: 'Try it in the Commit Lab' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'openCommitLab', scenario: 'sandbox' })
  })

  it('is only in the mentor DM', () => {
    setup('/flack/docs-team')
    expect(
      screen.queryByRole('list', { name: 'Questions you can ask Robin' })
    ).not.toBeInTheDocument()
  })
})
