import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PanelBoundary } from './PanelBoundary'
import { isStaleBuildError } from './staleBuild'

const failing = { error: undefined as Error | undefined }

function Flaky() {
  if (failing.error) throw failing.error
  return <p>All good</p>
}

beforeEach(() => {
  // React logs caught errors; they're expected here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  failing.error = undefined
  vi.restoreAllMocks()
})

describe('PanelBoundary', () => {
  it('shows a way out instead of a blank page, and Try again recovers', async () => {
    failing.error = new Error('boom')
    render(
      <>
        <PanelBoundary name="the editor">
          <Flaky />
        </PanelBoundary>
        <p>The rest of the game</p>
      </>
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong in the editor')
    expect(screen.getByText('The rest of the game')).toBeInTheDocument()

    failing.error = undefined
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('a chunk from an older deploy asks for a reload, not a retry', () => {
    failing.error = new TypeError(
      'Failed to fetch dynamically imported module: https://example.com/flack/assets/Editor-abc123.js'
    )
    render(
      <PanelBoundary name="the editor">
        <Flaky />
      </PanelBoundary>
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Flack has been updated')
    expect(screen.getByRole('alert')).toHaveTextContent('your progress is saved')
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('recognises each browser’s wording for a missing chunk', () => {
    expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: x'))).toBe(
      true
    )
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module: x'))).toBe(
      true
    )
    expect(isStaleBuildError(new Error('boom'))).toBe(false)
  })
})
