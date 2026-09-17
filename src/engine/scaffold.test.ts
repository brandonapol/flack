import { describe, expect, it } from 'vitest'

describe('engine test environment', () => {
  it('runs without a DOM, so the simulation stays framework-free', () => {
    expect(typeof document).toBe('undefined')
  })
})
