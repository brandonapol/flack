import { EditorView } from '@codemirror/view'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { toyConfig } from '../../engine/story/__fixtures__/toyChapter'
import { createGameStore, GameStoreProvider, type GameStore, type StorageLike } from '../../store'
import Editor from './Editor'
import { UnsavedEditsDialog } from './UnsavedEditsDialog'

const noStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

const probe = { path: '' }
function LocationProbe() {
  const { pathname } = useLocation()
  useEffect(() => {
    probe.path = pathname
  }, [pathname])
  return null
}

function setup(path = '/editor', prepare?: (store: GameStore) => void) {
  const store = createGameStore({ config: toyConfig(), storage: noStorage })
  prepare?.(store)
  render(
    <GameStoreProvider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <UnsavedEditsDialog />
        <Routes>
          <Route path="/editor/*" element={<Editor />} />
        </Routes>
      </MemoryRouter>
    </GameStoreProvider>
  )
  return { store, user: userEvent.setup() }
}

function editorView(): EditorView {
  const content = document.querySelector('.cm-content') as HTMLElement
  const view = EditorView.findFromDOM(content)
  if (!view) throw new Error('No CodeMirror view')
  return view
}

function typeAtEnd(text: string) {
  act(() => {
    const view = editorView()
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } })
  })
}

const files = () => within(screen.getByRole('navigation', { name: 'Files' }))

describe('Editor', () => {
  it('asks you to clone first when there is no repo', () => {
    setup('/editor', (store) =>
      store.setState((s) => ({ game: { ...s.game, git: { ...s.game.git, local: undefined } } }))
    )
    expect(screen.getByText(/Clone a repo first/)).toBeInTheDocument()
  })

  it('lists files with folders, and opens one from the tree', async () => {
    const { store, user } = setup()
    expect(files().getByRole('button', { name: /docs/ })).toHaveAttribute('aria-expanded', 'true')
    await user.click(files().getByRole('button', { name: /team\.md/ }))
    expect(store.getState().game.editor.openPath).toBe('team.md')
    expect(probe.path).toBe('/editor/team.md')
    expect(document.querySelector('.cm-content')).toHaveAttribute('aria-label', 'Editing team.md')
    expect(editorView().state.doc.toString()).toContain('- Robin Okafor')
  })

  it('opens the file in the URL', () => {
    const { store } = setup('/editor/team.md')
    expect(store.getState().game.editor.openPath).toBe('team.md')
  })

  it('editing marks the file dirty, and Save writes it', async () => {
    const { store, user } = setup('/editor/team.md')
    const save = screen.getByRole('button', { name: /Save/ })
    expect(save).toBeDisabled()

    typeAtEnd('- Ada Lovelace\n')
    expect(store.getState().game.editor.buffers['team.md']).toMatch(/- Ada Lovelace\n$/)
    expect(store.getState().game.git.local!.working['team.md']).not.toContain('Ada')
    expect(screen.getAllByText('(unsaved changes)').length).toBeGreaterThan(0)
    expect(save).toBeEnabled()

    await user.click(save)
    expect(store.getState().game.git.local!.working['team.md']).toMatch(/- Ada Lovelace\n$/)
    expect(store.getState().game.editor.buffers).toEqual({})
    expect(screen.queryByText('(unsaved changes)')).not.toBeInTheDocument()
  })

  it('says so when an edit changes lines that were already there, and can undo it', async () => {
    const { store, user } = setup('/editor/team.md')
    typeAtEnd('- Ada Lovelace\n')
    expect(screen.queryByText(/already in/)).not.toBeInTheDocument()

    act(() => {
      const view = editorView()
      const text = view.state.doc.toString()
      const from = text.indexOf('- Robin Okafor')
      view.dispatch({ changes: { from, to: from + 1, insert: '- -' } })
    })
    const note = screen.getByText(/already in/).closest('p')!
    expect(note).toHaveTextContent('This edit changes 1 line that was already in team.md')
    await user.click(within(note).getByRole('button', { name: 'Undo my changes' }))
    expect(store.getState().game.editor.buffers).toEqual({})
    await waitFor(() => expect(editorView().state.doc.toString()).not.toContain('- -'))
  })

  it('⌘S and Ctrl+S save', async () => {
    const { store, user } = setup('/editor/team.md')
    typeAtEnd('- Ada\n')
    await user.click(document.querySelector('.cm-content') as HTMLElement)
    await user.keyboard('{Meta>}s{/Meta}')
    expect(store.getState().game.git.local!.working['team.md']).toMatch(/- Ada\n$/)
    typeAtEnd('- Bo\n')
    await user.keyboard('{Control>}s{/Control}')
    expect(store.getState().game.git.local!.working['team.md']).toMatch(/- Bo\n$/)
  })

  it('files the current step does not need are read-only', () => {
    const { store } = setup('/editor/README.md')
    expect(screen.getByRole('note')).toHaveTextContent('read-only')
    expect(document.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false')
    expect(editorView().state.readOnly).toBe(true)
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
    expect(store.getState().game.editor.buffers).toEqual({})
  })

  it('shows new content after a pull changes the open file', () => {
    const { store } = setup('/editor/team.md')
    act(() => store.getState().dispatch({ type: 'runCommand', line: 'rewrite team.md' }))
    expect(editorView().state.doc.toString()).toBe('rewritten\n')
  })

  it('stops a pull that would replace unsaved edits and offers to save or discard', async () => {
    const { store, user } = setup('/editor/team.md')
    typeAtEnd('- Ada\n')
    act(() => store.getState().dispatch({ type: 'runCommand', line: 'rewrite team.md' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Save or discard your edits first' })
    expect(dialog).toHaveTextContent('team.md')
    await user.click(within(dialog).getByRole('button', { name: 'Discard my edits' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(store.getState().game.editor.buffers).toEqual({})
    // The editor holds off outside updates briefly after typing, so give it a moment.
    await waitFor(() => expect(editorView().state.doc.toString()).not.toContain('- Ada'))
  })

  it('shows the current branch', () => {
    setup('/editor/team.md')
    expect(screen.getByTitle("The branch you're editing on")).toHaveTextContent('Branch: main')
  })
})
