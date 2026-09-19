import { act, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameConfig } from '../../content'
import { squash } from '../../engine/lab/graph'
import type { GameConfig, LabScenario } from '../../engine/story/types'
import { createGameStore, GameStoreProvider, type StorageLike } from '../../store'
import { CommitLab } from './CommitLab'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function withGuided(config: GameConfig): GameConfig {
  const sandbox = config.labScenarios!.sandbox
  const target = squash(sandbox.start, ['y1', 'y2', 'y3'])
  if (!target.ok) throw new Error()
  const guided: LabScenario = {
    ...sandbox,
    id: 'tidy',
    title: 'Tidy it up',
    intro: 'Squash your three commits into one.',
    target: target.graph,
    squashLabel: 'Write the intro',
  }
  return { ...config, labScenarios: { ...config.labScenarios, tidy: guided } }
}

function setup(scenario = 'sandbox') {
  const store = createGameStore({ config: withGuided(createGameConfig()), storage: noStorage })
  const dispatch = vi.fn(store.getState().dispatch)
  store.setState({ dispatch })
  act(() => store.getState().dispatch({ type: 'openCommitLab', scenario }))
  const view = render(
    <GameStoreProvider store={store}>
      <CommitLab />
    </GameStoreProvider>
  )
  return { store, dispatch, container: view.container }
}

/** A commit, by the start of its accessible name. */
const commit = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`^${label.replace(/[+]/g, '\\+')},`) })
const commits = () =>
  within(screen.getByRole('group', { name: 'Commit graph' })).getAllByRole('button')

const press = (element: Element) => act(() => void fireEvent.keyDown(element, { key: 'Enter' }))
const click = (element: Element) => act(() => void fireEvent.click(element))

/** Keyboard: select one commit, then another, then pick from the menu. */
function perform(source: string, target: string, action: string) {
  press(commit(source))
  press(commit(target))
  click(
    within(screen.getByRole('group', { name: 'What should happen?' })).getByRole('button', {
      name: action,
    })
  )
}

/** The visible “Picked up …” note above the graph. */
const pickedUp = () =>
  screen.queryByText(
    (_, element) => element?.tagName === 'P' && /^Picked up “/.test(element.textContent ?? '')
  )

const caption = () => screen.getByText(/^(Rebase|Merge|Squash|Cherry-pick) /, { selector: 'p' })
const announced = () => screen.getAllByRole('status').at(-1)!.textContent

afterEach(() => {
  vi.restoreAllMocks()
  // jsdom has no elementFromPoint; tests that fake one mustn't leave it for the next.
  Reflect.deleteProperty(document, 'elementFromPoint')
})

describe('Commit Lab', () => {
  it('opens over the middle panel with the scenario and a graph', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Play with a commit graph' })).toBeInTheDocument()
    expect(commits()).toHaveLength(7)
    expect(commit('Fix a typo')).toHaveAccessibleName('Fix a typo, by AC, on main, newest on main')
  })

  it('rebase: the branch’s commits start again from main’s latest, as copies', () => {
    setup()
    perform('Add a tip about links', 'Fix a typo', 'Rebase onto here')
    expect(commit('Draft the intro')).toHaveAccessibleName(/a new copy/)
    expect(commit('Add a tip about links')).toHaveAccessibleName(/a new copy, newest on yours/)
    expect(commits()).toHaveLength(7)
    expect(caption()).toHaveTextContent('Rebase replays your commits on top of the latest work')
    expect(announced()).toBe('3 commits on yours now start from “Fix a typo”.')
  })

  it('merge (by dragging): a new commit joins both histories', () => {
    setup()
    const source = commit('Add a tip about headings')
    const target = commit('Fix a typo')
    document.elementFromPoint = vi.fn(() => target)
    const svg = screen.getByRole('group', { name: 'Commit graph' })
    act(() => void fireEvent.pointerDown(source, { clientX: 10, clientY: 10 }))
    act(() => void fireEvent.pointerMove(svg, { clientX: 120, clientY: 90 }))
    act(() => void fireEvent.pointerUp(svg, { clientX: 120, clientY: 90 }))
    click(screen.getByRole('button', { name: 'Merge with here' }))

    expect(commit('Merge sam into main')).toHaveAccessibleName(/newest on main/)
    expect(caption()).toHaveTextContent('Merge keeps both histories')
  })

  it('squash: several commits collapse into one', () => {
    setup()
    perform('Draft the intro', 'Add a tip about links', 'Squash into here')
    expect(commits()).toHaveLength(5)
    expect(commit('Draft the intro + wip + Add a tip about links')).toHaveAccessibleName(
      /squashed from 3 commits, newest on yours/
    )
    expect(caption()).toHaveTextContent('Squash turns several small commits into one')
  })

  it('cherry-pick: a copy lands on the other branch, the original stays', () => {
    setup()
    perform('Draft the intro', 'Add a tip about headings', 'Cherry-pick to here')
    const copies = screen.getAllByRole('button', { name: /^Draft the intro,/ })
    expect(copies.map((node) => node.getAttribute('aria-label'))).toEqual([
      'Draft the intro, by You, on yours',
      'Draft the intro, by You, on sam, a new copy, newest on sam',
    ])
    expect(caption()).toHaveTextContent('Cherry-pick copies one commit')
  })

  it.each([
    ['Keep mine', '- Link to the page, not the heading.'],
    ['Keep theirs', '- Use sentence case for headings.'],
    ['Keep both', '- Link to the page, not the heading.\n- Use sentence case for headings.'],
  ])('a conflict asks first; %s shows the result', (choice, result) => {
    setup()
    perform('Add a tip about links', 'Add a tip about headings', 'Merge with here')
    const callout = screen.getByRole('alertdialog', { name: '⚠ These changed the same spot' })
    expect(callout).toHaveTextContent('- Link to the page, not the heading.')
    expect(callout).toHaveTextContent('- Use sentence case for headings.')
    expect(callout).toHaveTextContent('<<<<<<<')

    click(within(callout).getByRole('button', { name: choice }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(commit('Merge yours into sam')).toBeInTheDocument()
    expect(screen.getByText(result, { selector: 'pre', normalizer: (text) => text })).toBeVisible()
  })

  it('undo puts the graph back, and reset goes to the start', () => {
    setup()
    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toBeDisabled()
    perform('Draft the intro', 'Add a tip about links', 'Squash into here')
    perform('Add a tip about headings', 'Fix a typo', 'Rebase onto here')
    click(undo)
    expect(commits()).toHaveLength(5)
    expect(commit('Add a tip about headings')).not.toHaveAccessibleName(/a new copy/)
    click(screen.getByRole('button', { name: 'Reset' }))
    expect(commits()).toHaveLength(7)
    expect(undo).toBeDisabled()
  })

  it('offers nothing where nothing can happen', () => {
    setup()
    press(commit('Start the docs site'))
    press(commit('Add the style guide'))
    expect(
      within(screen.getByRole('group', { name: 'What should happen?' })).getByText(
        'Nothing to do there. Try another commit.'
      )
    ).toBeInTheDocument()
  })

  it('guided mode completes only when the target shape is reached', () => {
    const { dispatch } = setup('tidy')
    const completions = () =>
      dispatch.mock.calls.filter(([action]) => action.type === 'completeCommitLab')
    perform('Add a tip about headings', 'Fix a typo', 'Rebase onto here')
    expect(completions()).toHaveLength(0)
    click(screen.getByRole('button', { name: 'Undo' }))
    perform('Draft the intro', 'Add a tip about links', 'Squash into here')
    expect(completions()).toHaveLength(1)
    expect(commit('Write the intro')).toBeInTheDocument()
    expect(screen.getByText('That’s the shape.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I get it' })).not.toBeInTheDocument()
  })

  it('the bonus round: keeping both is flagged, picking one completes it', () => {
    const { dispatch } = setup('bonus-reword')
    const completions = () =>
      dispatch.mock.calls.filter(([action]) => action.type === 'completeCommitLab')
    // Both commits have the same label; the first is on main, the second on yours.
    const [, yours] = screen.getAllByRole('button', { name: /^Reword the voice sentence,/ })
    press(yours)
    press(screen.getAllByRole('button', { name: /^Reword the voice sentence,/ })[0])
    click(screen.getByRole('button', { name: 'Merge with here' }))
    click(screen.getByRole('button', { name: 'Keep both' }))
    expect(screen.getByText(/says the same thing twice/)).toBeVisible()
    expect(completions()).toHaveLength(0)

    click(screen.getByRole('button', { name: 'Undo' }))
    press(screen.getAllByRole('button', { name: /^Reword the voice sentence,/ })[1])
    press(screen.getAllByRole('button', { name: /^Reword the voice sentence,/ })[0])
    click(screen.getByRole('button', { name: 'Merge with here' }))
    click(screen.getByRole('button', { name: 'Keep theirs' }))
    expect(completions()).toHaveLength(1)
    expect(screen.getByText('That’s the shape.')).toBeInTheDocument()
  })

  it('the bonus round also completes by rebasing onto Alex’s and picking one', () => {
    const { dispatch } = setup('bonus-reword')
    const completions = () =>
      dispatch.mock.calls.filter(([action]) => action.type === 'completeCommitLab')
    const [alex, yours] = screen.getAllByRole('button', { name: /^Reword the voice sentence,/ })
    press(yours)
    press(alex)
    click(screen.getByRole('button', { name: 'Rebase onto here' }))
    click(screen.getByRole('button', { name: 'Keep mine' }))
    expect(completions()).toHaveLength(1)
    expect(screen.getByText('That’s the shape.')).toBeInTheDocument()
  })

  it('picking up and putting down stays in step with aria-pressed and the note', () => {
    setup()
    const links = commit('Add a tip about links')
    press(links)
    expect(links).toHaveAttribute('aria-pressed', 'true')
    expect(pickedUp()).toHaveTextContent('Picked up “Add a tip about links” on yours')
    click(links)
    expect(links).toHaveAttribute('aria-pressed', 'false')
    expect(pickedUp()).toBeNull()

    press(links)
    act(() => void fireEvent.keyDown(links, { key: 'Escape' }))
    expect(links).toHaveAttribute('aria-pressed', 'false')
  })

  it('a click that wobbles a little still picks a commit up', () => {
    setup()
    const links = commit('Add a tip about links')
    const graph = screen.getByRole('group', { name: 'Commit graph' })
    // jsdom has no PointerEvent, so send mouse events with pointer names: they carry coordinates.
    // One act each, as in a browser: every event sees the state the one before it left.
    const pointer = (target: Element, type: string, clientX: number, clientY: number) =>
      act(() => void fireEvent(target, new MouseEvent(type, { bubbles: true, clientX, clientY })))
    // Released over the same commit it was pressed on.
    document.elementFromPoint = vi.fn(() => links)
    pointer(links, 'pointerdown', 100, 100)
    pointer(graph, 'pointermove', 106, 104)
    pointer(graph, 'pointerup', 106, 104)
    act(() => void fireEvent.click(links))
    expect(links).toHaveAttribute('aria-pressed', 'true')
  })

  it('free mode closes with “I get it”', () => {
    const { store } = setup()
    click(screen.getByRole('button', { name: 'I get it' }))
    expect(store.getState().game.ui.commitLab).toBeUndefined()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no serious accessibility problems', async () => {
    const { container } = setup()
    press(commit('Add a tip about links'))
    press(commit('Add a tip about headings'))
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    )
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })
})

describe('Commit Lab focus', () => {
  it('moves focus to its title when it opens, and back where it was when it closes', () => {
    const store = createGameStore({ config: createGameConfig(), storage: noStorage })
    render(
      <GameStoreProvider store={store}>
        <button type="button">Try it in the Commit Lab</button>
        <CommitLab />
      </GameStoreProvider>
    )
    const opener = screen.getByRole('button', { name: 'Try it in the Commit Lab' })
    act(() => opener.focus())
    act(() => store.getState().dispatch({ type: 'openCommitLab', scenario: 'sandbox' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()

    click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
