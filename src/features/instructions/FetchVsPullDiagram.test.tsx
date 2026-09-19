import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FetchVsPullDiagram } from './FetchVsPullDiagram'

describe('FetchVsPullDiagram', () => {
  it('shows three snapshots of GitNub main, origin/main and your main', () => {
    render(<FetchVsPullDiagram />)

    const before = screen.getByText('Before').closest('div')!
    expect(within(before).getByText('GitNub’s main')).toBeInTheDocument()
    expect(within(before).getAllByText('Alex’s fix')).toHaveLength(1)
    expect(within(before).getAllByText('Yesterday’s docs')).toHaveLength(2)

    const fetched = screen.getByText('After `git fetch`').closest('div')!
    expect(within(fetched).getAllByText('Alex’s fix')).toHaveLength(2)
    expect(within(fetched).getAllByText('Yesterday’s docs')).toHaveLength(1)
    expect(within(fetched).getByText('origin/main').closest('li')?.className).toMatch(/moved/)

    const merged = screen.getByText('After `git merge origin/main`').closest('div')!
    expect(within(merged).getAllByText('Alex’s fix')).toHaveLength(3)
    expect(within(merged).getByText('Your main').closest('li')?.className).toMatch(/moved/)
  })
})
