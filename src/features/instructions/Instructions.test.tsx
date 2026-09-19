import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameConfig } from '../../content'
import { toyConfig } from '../../engine/story/__fixtures__/toyChapter'
import { createGameStore, GameStoreProvider, type GameStore, type StorageLike } from '../../store'
import { Instructions } from './Instructions'
import { InstructionsText } from './InstructionsText'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function setup(config = toyConfig()) {
  const store = createGameStore({ config, storage: noStorage })
  const dispatch = vi.fn(store.getState().dispatch)
  store.setState({ dispatch })
  render(
    <GameStoreProvider store={store}>
      <MemoryRouter>
        <Instructions />
      </MemoryRouter>
    </GameStoreProvider>
  )
  return { store, dispatch }
}

const click = (element: HTMLElement) => act(() => void fireEvent.click(element))

function run(store: GameStore, line: string) {
  act(() => store.getState().dispatch({ type: 'runCommand', line }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Instructions panel', () => {
  it('shows the chapter number, title and progress', () => {
    const { store } = setup()
    expect(screen.getByText('Chapter 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A toy chapter', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Chapter progress' })).toHaveAttribute(
      'aria-valuenow',
      '0'
    )
    run(store, 'echo hello')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('ticks off steps as they are completed and moves the current marker', () => {
    const { store } = setup()
    const items = () => screen.getAllByRole('listitem')
    expect(items()[0]).toHaveTextContent('Say hello (current step)')
    expect(items()[0]).toHaveAttribute('aria-current', 'step')
    expect(items()[2]).toHaveTextContent('Save team.md (not started)')

    run(store, 'echo hello')
    expect(items()[0]).toHaveTextContent('Say hello (done)')
    expect(items()[1]).toHaveTextContent('Peek at team.mdoptional (current step)')
    expect(within(items()[1]).getByText('optional')).toBeInTheDocument()
  })

  it('shows the current step body and what just happened', () => {
    const { store } = setup()
    expect(screen.getByRole('region', { name: 'What to do now' })).toHaveTextContent(
      'Type echo hello.'
    )
    run(store, 'echo hello')
    act(() => store.getState().dispatch({ type: 'openFile', path: 'team.md' }))
    expect(screen.getByRole('region', { name: 'What to do now' })).toHaveTextContent(
      'Add your name.'
    )
  })

  it('escalates hints, and shows the exact command on request', () => {
    const { store } = setup()
    expect(screen.queryByText(/Hint 1:/)).not.toBeInTheDocument()
    click(screen.getByRole('button', { name: 'Hint' }))
    expect(screen.getByText('Hint 1:').parentElement).toHaveTextContent('Use echo.')
    click(screen.getByRole('button', { name: 'Another hint' }))
    expect(screen.getByText('Hint 2:').parentElement).toHaveTextContent('Type: echo hello')
    expect(screen.queryByRole('button', { name: 'Another hint' })).not.toBeInTheDocument()

    click(screen.getByRole('button', { name: 'Show me' }))
    expect(screen.getByText('Do this:').parentElement).toHaveTextContent('echo hello')
    expect(store.getState().game.story.solutionShown).toBe(true)
  })

  it('shows every command, one per line, when a step needs several', () => {
    const config = toyConfig()
    config.chapters[0].steps[0].solution = ['echo one', 'echo two']
    setup(config)
    click(screen.getByRole('button', { name: 'Show me' }))
    const commands = within(screen.getByText('Do this:').parentElement!).getAllByText(/^echo /)
    expect(commands.map((command) => command.textContent)).toEqual(['echo one', 'echo two'])
  })

  it('pulses the hint button after two misses', () => {
    const { store } = setup()
    const before = screen.getByRole('button', { name: 'Hint' }).className
    run(store, 'echo nope')
    run(store, 'fail')
    expect(screen.getByRole('button', { name: 'Hint' }).className).not.toBe(before)
  })

  it('copies inline code when you click it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setup()
    click(screen.getByRole('button', { name: 'echo hello' }))
    expect(writeText).toHaveBeenCalledWith('echo hello')
    expect(await screen.findByRole('status')).toHaveTextContent('Copied echo hello')
  })

  it('restart chapter asks first, then restarts', () => {
    const { store } = setup()
    run(store, 'echo hello')
    click(screen.getByRole('button', { name: 'Restart chapter' }))
    expect(screen.getByRole('group', { name: 'Start this chapter again?' })).toBeInTheDocument()
    click(screen.getByRole('button', { name: 'Cancel' }))
    expect(store.getState().game.story.stepIndex).toBe(1)

    click(screen.getByRole('button', { name: 'Restart chapter' }))
    click(screen.getByRole('button', { name: 'Restart' }))
    expect(store.getState().game.story.stepIndex).toBe(0)
    expect(store.getState().game.story.completedSteps).toEqual([])
  })

  it('reset everything asks first', () => {
    const { store } = setup()
    run(store, 'echo hello')
    click(screen.getByRole('button', { name: 'Reset everything' }))
    click(screen.getByRole('button', { name: 'Reset' }))
    expect(store.getState().game.story.completedSteps).toEqual([])
  })

  it('the chapter menu only offers chapters you have reached', () => {
    const { store } = setup()
    click(screen.getByRole('button', { name: 'Chapters' }))
    const menu = screen.getByRole('list', { name: 'Chapters' })
    const [first, second] = within(menu).getAllByRole('button')
    expect(first).toHaveAttribute('aria-current', 'true')
    expect(second).toBeDisabled()
    click(first)
    expect(store.getState().game.story.chapterId).toBe('toy')
  })

  it('celebrates when the chapter is finished', () => {
    const { store, dispatch } = setup()
    run(store, 'echo hello')
    act(() => {
      store.getState().dispatch({ type: 'saveFile', path: 'team.md', content: 'x\n' })
      store.getState().dispatch({
        type: 'applyEffect',
        effect: {
          type: 'flackMessage',
          id: 'sam-hi',
          channel: 'docs-team',
          from: 'sam',
          text: 'hi',
          quickReplies: [{ id: 'wave', text: '👋' }],
        },
      })
      store.getState().dispatch({ type: 'flackReply', messageId: 'sam-hi', replyId: 'wave' })
    })
    expect(screen.getByRole('region', { name: 'Chapter complete' })).toHaveTextContent(
      'You said hello.'
    )
    click(screen.getByRole('button', { name: 'Keep going' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'continueStory' })
    expect(store.getState().game.story.chapterId).toBe('epilogue')
  })
})

describe('glossary terms', () => {
  it('explains the first mention of a term, and leaves code alone', () => {
    render(
      <InstructionsText source="Make a branch, then push it. Another branch. Run `git branch`." />
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['branch', 'push', 'git branch'])
    click(buttons[0])
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('A named line of work')
    expect(within(note).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('git-scm.com')
    )
  })

  it('an optional step can be skipped', () => {
    const { store } = setup()
    run(store, 'echo hello')
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('(current step)')
    click(screen.getByRole('button', { name: 'Skip this step' }))
    expect(store.getState().game.story.skippedSteps).toEqual(['peek'])
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('(skipped)')
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('(current step)')
    expect(screen.queryByRole('button', { name: 'Skip this step' })).not.toBeInTheDocument()
  })
})

describe('Where are my changes?, from Chapter 3 on', () => {
  function setupChapter(search: string) {
    const store = createGameStore({ config: createGameConfig(), storage: noStorage, search })
    render(
      <GameStoreProvider store={store}>
        <MemoryRouter>
          <Instructions />
        </MemoryRouter>
      </GameStoreProvider>
    )
    click(screen.getByRole('button', { name: /Where are my changes\?/ }))
  }

  it('Chapter 3 (the first git status) only shows working/staged/commits', () => {
    setupChapter('?chapter=02')
    expect(screen.getByText('Chapter 3 of 9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Working files/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^My commits/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Open MR/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^GitNub main/ })).not.toBeInTheDocument()
  })

  it('Chapter 4 on (push and merge requests) shows the full picture', () => {
    setupChapter('?chapter=03')
    expect(screen.getByText('Chapter 4 of 9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Working files/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Open MR/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^GitNub main/ })).toBeInTheDocument()
  })
})
