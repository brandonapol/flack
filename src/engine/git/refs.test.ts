import { describe, expect, it } from 'vitest'

import { docsSite } from './__fixtures__/docsSite'
import { resolveRef } from './refs'
import { clone } from './repo'

describe('resolveRef', () => {
  const local = clone(docsSite())
  const tip = local.branches.main
  const parent = local.commits[tip].parents[0]

  it('resolves HEAD, branches, remote-tracking refs and ids', () => {
    expect(resolveRef(local, 'HEAD')).toBe(tip)
    expect(resolveRef(local, 'main')).toBe(tip)
    expect(resolveRef(local, 'origin/main')).toBe(tip)
    expect(resolveRef(local, 'origin')).toBe(tip)
    expect(resolveRef(local, tip.slice(0, 7))).toBe(tip)
  })

  it('walks parents with ~ and ^', () => {
    expect(resolveRef(local, 'HEAD~1')).toBe(parent)
    expect(resolveRef(local, 'HEAD^')).toBe(parent)
    expect(resolveRef(local, 'main~')).toBe(parent)
    expect(resolveRef(local, 'HEAD~5')).toBeUndefined()
  })

  it('returns undefined for anything else', () => {
    expect(resolveRef(local, 'nope')).toBeUndefined()
    expect(resolveRef(local, 'origin/nope')).toBeUndefined()
  })
})
