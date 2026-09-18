import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { toyConfig } from '../../engine/story/__fixtures__/toyChapter'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import { Terminal } from './Terminal'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function setup() {
  const store = createGameStore({ config: toyConfig(), storage: noStorage })
  render(
    <GameStoreProvider store={store}>
      <Terminal />
    </GameStoreProvider>
  )
  const input = screen.getByRole('textbox', { name: /Terminal command/ })
  const log = screen.getByRole('log', { name: 'Terminal output' })
  return { store, input, log, user: userEvent.setup() }
}

describe('Terminal', () => {
  it('echoes the command and shows its output', async () => {
    const { input, log, user } = setup()
    await user.type(input, 'echo hello world{Enter}')
    expect(log).toHaveTextContent('you@INKWELL-LAPTOP MINGW64 ~$ echo hello world')
    expect(log.textContent).toContain('hello world')
    expect(input).toHaveValue('')
  })

  it('labels the input with the prompt', () => {
    const { input } = setup()
    expect(input).toHaveAccessibleName('Terminal command, at ~')
  })

  it('↑ and ↓ walk through history and restore the line being typed', async () => {
    const { input, user } = setup()
    await user.type(input, 'echo one{Enter}echo two{Enter}echo thr')
    await user.keyboard('{ArrowUp}')
    expect(input).toHaveValue('echo two')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(input).toHaveValue('echo one')
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveValue('echo two')
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveValue('echo thr')
  })

  it('Ctrl+L and ⌘K clear the screen', async () => {
    const { input, log, user } = setup()
    await user.type(input, 'echo hello{Enter}')
    expect(log).toHaveTextContent('hello')
    await user.keyboard('{Control>}l{/Control}')
    expect(log).toBeEmptyDOMElement()

    await user.type(input, 'echo again{Enter}')
    await user.keyboard('{Meta>}k{/Meta}')
    expect(log).toBeEmptyDOMElement()
  })

  it('Ctrl+C abandons the current line', async () => {
    const { input, log, user, store } = setup()
    await user.type(input, 'git sta')
    await user.keyboard('{Control>}c{/Control}')
    expect(input).toHaveValue('')
    expect(log).toHaveTextContent('$ git sta^C')
    expect(store.getState().game.shell.history).toEqual([])
  })

  it('a multi-line paste runs only the first line and says so', () => {
    const { input, log } = setup()
    act(() => {
      fireEvent.paste(input, {
        clipboardData: { getData: () => 'echo first\necho second\n' },
      })
    })
    expect(log).toHaveTextContent('$ echo first')
    expect(log).not.toHaveTextContent('second')
    expect(screen.getByRole('status')).toHaveTextContent('Only the first one was run')
  })

  it('clicking the panel focuses the input', async () => {
    const { input, log, user } = setup()
    await user.click(log)
    expect(input).toHaveFocus()
  })

  it('colours output by tone', async () => {
    const { input, user, log } = setup()
    await user.type(input, 'fail{Enter}')
    const line = [...log.querySelectorAll('div')].find((el) => el.textContent === 'nope')
    expect(line?.className).toMatch(/tone-error/)
  })
})
