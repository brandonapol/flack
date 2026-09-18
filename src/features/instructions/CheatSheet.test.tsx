import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CheatSheet } from './CheatSheet'

describe('cheat sheet', () => {
  it('is headed “The daily loop” and lists the whole loop in order', () => {
    render(
      <MemoryRouter>
        <CheatSheet />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'The daily loop', level: 1 })).toBeInTheDocument()
    const steps = screen
      .getAllByRole('listitem')
      .map((item) => item.querySelector('code')?.textContent)
    expect(steps).toEqual([
      'git switch main',
      'git pull',
      'git switch -c my-change',
      '(edit and save your files)',
      'git status',
      'git add my-file.md',
      'git commit -m "What I changed"',
      'git push -u origin my-change',
      'Open the pull request',
      'Squash and merge',
      'Delete branch',
      'git switch main',
      'git pull',
    ])
  })

  it('says what a branch, a squash, Update branch and conflicts are, without going deep', () => {
    render(
      <MemoryRouter>
        <CheatSheet />
      </MemoryRouter>
    )
    const also = screen.getByRole('heading', { name: /You’ll also hear about/ }).parentElement!
    expect(within(also).getByText('A branch')).toBeInTheDocument()
    expect(within(also).getByText('Squash')).toBeInTheDocument()
    expect(within(also).getByText('Update branch')).toBeInTheDocument()
    expect(within(also).getByText('Conflicts')).toBeInTheDocument()
    expect(also).toHaveTextContent('next module')
  })

  it('never mentions trunk-based development', () => {
    const { container } = render(
      <MemoryRouter>
        <CheatSheet />
      </MemoryRouter>
    )
    expect(container.textContent?.toLowerCase()).not.toContain('trunk')
  })
})
