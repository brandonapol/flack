import { describe, expect, it } from 'vitest'

import { levenshtein, suggest } from './suggest'

const GIT = [
  'add',
  'branch',
  'clone',
  'commit',
  'config',
  'diff',
  'fetch',
  'log',
  'pull',
  'push',
  'status',
  'switch',
]

describe('suggest', () => {
  it('finds git subcommand typos', () => {
    expect(suggest('comit', GIT)).toBe('commit')
    expect(suggest('psuh', GIT)).toBe('push')
    expect(suggest('stauts', GIT)).toBe('status')
    expect(suggest('stats', GIT)).toBe('status')
  })

  it('finds top-level typos', () => {
    expect(suggest('gti', ['git', 'ls', 'cd', 'help'])).toBe('git')
  })

  it('gives up when nothing is close', () => {
    expect(suggest('rebase-interactive', GIT)).toBeUndefined()
  })

  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
  })
})
