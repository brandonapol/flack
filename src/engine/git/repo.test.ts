import { describe, expect, it } from 'vitest'

import { ada, docsSite, T0 } from './__fixtures__/docsSite'
import {
  aheadBehind,
  clone,
  commit,
  discard,
  headCommit,
  headTree,
  isAncestor,
  log,
  resolveCommitId,
  stage,
  unstage,
} from './repo'
import { getStatus, isClean } from './status'
import type { LocalRepo } from './types'

function edit(local: LocalRepo, path: string, content: string): LocalRepo {
  return { ...local, working: { ...local.working, [path]: content } }
}

function mustStage(local: LocalRepo, specs: string[]): LocalRepo {
  const result = stage(local, specs)
  if (!result.ok) throw new Error(`stage failed: ${result.error.path}`)
  return result.local
}

describe('clone', () => {
  it('copies the remote exactly, with main tracking origin/main', () => {
    const remote = docsSite()
    const local = clone(remote)
    expect(local.dir).toBe('docs-site')
    expect(local.head).toBe('main')
    expect(local.branches.main).toBe(remote.branches.main)
    expect(local.remoteBranches).toEqual(remote.branches)
    expect(local.upstreams).toEqual({ main: 'main' })
    expect(local.commits).toEqual(remote.commits)
    expect(local.working).toEqual(remote.commits[remote.branches.main].tree)
    expect(local.index).toEqual(local.working)
    expect(isClean(getStatus(local))).toBe(true)
  })

  it('does not share mutable objects with the remote', () => {
    const remote = docsSite()
    const local = clone(remote)
    local.working['team.md'] = 'changed'
    expect(remote.commits[remote.branches.main].tree['team.md']).not.toBe('changed')
  })
})

describe('ids', () => {
  it('are deterministic and 40 hex characters', () => {
    const a = docsSite()
    const b = docsSite()
    expect(a.branches.main).toBe(b.branches.main)
    expect(a.branches.main).toMatch(/^[0-9a-f]{40}$/)
  })

  it('resolve from an abbreviation', () => {
    const remote = docsSite()
    const tip = remote.branches.main
    expect(resolveCommitId(remote.commits, tip.slice(0, 7))).toBe(tip)
    expect(resolveCommitId(remote.commits, 'abc')).toBeUndefined()
    expect(resolveCommitId(remote.commits, 'zzzzzzz')).toBeUndefined()
  })
})

describe('status, stage and commit', () => {
  it('a saved edit shows as unstaged', () => {
    const local = edit(clone(docsSite()), 'team.md', 'changed\n')
    const status = getStatus(local)
    expect(status.unstaged).toEqual([{ path: 'team.md', kind: 'modified' }])
    expect(status.staged).toEqual([])
    expect(status.upstream).toEqual({ name: 'origin/main', gone: false, ahead: 0, behind: 0 })
  })

  it('git add moves the change to staged', () => {
    const local = mustStage(edit(clone(docsSite()), 'team.md', 'changed\n'), ['team.md'])
    const status = getStatus(local)
    expect(status.staged).toEqual([{ path: 'team.md', kind: 'modified' }])
    expect(status.unstaged).toEqual([])
  })

  it('stages by directory, by ".", and picks up new and deleted files', () => {
    let local = clone(docsSite())
    local = edit(local, 'docs/new.md', 'hi\n')
    local = { ...local, working: { ...local.working } }
    delete local.working['README.md']
    expect(getStatus(local).untracked).toEqual(['docs/new.md'])
    expect(getStatus(local).unstaged).toEqual([{ path: 'README.md', kind: 'deleted' }])

    const byDir = mustStage(local, ['docs/'])
    expect(getStatus(byDir).staged).toEqual([{ path: 'docs/new.md', kind: 'new' }])

    const all = mustStage(local, ['.'])
    expect(getStatus(all).staged).toEqual([
      { path: 'README.md', kind: 'deleted' },
      { path: 'docs/new.md', kind: 'new' },
    ])
  })

  it('git add with an unknown path is a pathspec error and changes nothing', () => {
    const result = stage(clone(docsSite()), ['nope.md'])
    expect(result).toEqual({ ok: false, error: { kind: 'pathspec', path: 'nope.md' } })
  })

  it('commit makes the tree clean, advances only the branch, and tops the log', () => {
    const before = clone(docsSite())
    const staged = mustStage(edit(before, 'team.md', 'changed\n'), ['.'])
    const result = commit(staged, {
      message: 'Add Ada to team list',
      config: ada,
      timestamp: T0 + 600,
    })
    if (!result.ok) throw new Error(result.error)

    const local = result.local
    expect(isClean(getStatus(local))).toBe(true)
    expect(headCommit(local).message).toBe('Add Ada to team list')
    expect(headCommit(local).parents).toEqual([before.branches.main])
    expect(headCommit(local).author).toEqual({ name: 'Ada', email: 'ada@inkwell.example' })
    expect(local.remoteBranches.main).toBe(before.branches.main)
    expect(getStatus(local).upstream).toMatchObject({ ahead: 1, behind: 0 })
    expect(log(local.commits, local.branches.main).map((c) => c.message)).toEqual([
      'Add Ada to team list',
      'Add team list',
      'Start the docs site',
    ])
  })

  it('commit with nothing staged is refused', () => {
    const local = edit(clone(docsSite()), 'team.md', 'changed\n')
    expect(commit(local, { message: 'x', config: ada, timestamp: T0 })).toEqual({
      ok: false,
      error: 'nothing-to-commit',
    })
  })

  it('commit without an identity is refused before anything else is checked', () => {
    const local = clone(docsSite())
    expect(commit(local, { message: 'x', config: {}, timestamp: T0 })).toEqual({
      ok: false,
      error: 'identity-unknown',
    })
    expect(
      commit(local, { message: 'x', config: { userName: 'Ada' }, timestamp: T0 })
    ).toMatchObject({ ok: false, error: 'identity-unknown' })
  })

  it('commit with an empty message is refused', () => {
    const local = mustStage(edit(clone(docsSite()), 'team.md', 'changed\n'), ['.'])
    expect(commit(local, { message: '  ', config: ada, timestamp: T0 })).toMatchObject({
      ok: false,
      error: 'empty-message',
    })
  })
})

describe('restore', () => {
  it('restore --staged unstages but keeps the edit', () => {
    const staged = mustStage(edit(clone(docsSite()), 'team.md', 'changed\n'), ['team.md'])
    const result = unstage(staged, ['team.md'])
    if (!result.ok) throw new Error()
    expect(getStatus(result.local).staged).toEqual([])
    expect(getStatus(result.local).unstaged).toEqual([{ path: 'team.md', kind: 'modified' }])
    expect(result.local.working['team.md']).toBe('changed\n')
  })

  it('restore throws away the unstaged edit', () => {
    const local = clone(docsSite())
    const result = discard(edit(local, 'team.md', 'changed\n'), ['team.md'])
    if (!result.ok) throw new Error()
    expect(result.local.working['team.md']).toBe(headTree(local)['team.md'])
    expect(isClean(getStatus(result.local))).toBe(true)
  })

  it('restore ignores untracked files and errors on unknown paths', () => {
    const local = edit(clone(docsSite()), 'notes.md', 'x')
    expect(discard(local, ['notes.md'])).toMatchObject({ ok: false })
  })
})

describe('ancestry', () => {
  it('knows ancestors and counts ahead/behind', () => {
    const remote = docsSite()
    const local = clone(remote)
    const staged = mustStage(edit(local, 'team.md', 'x\n'), ['.'])
    const result = commit(staged, { message: 'm', config: ada, timestamp: T0 + 1000 })
    if (!result.ok) throw new Error()
    const { commits, branches } = result.local
    expect(isAncestor(commits, remote.branches.main, branches.main)).toBe(true)
    expect(isAncestor(commits, branches.main, remote.branches.main)).toBe(false)
    expect(aheadBehind(commits, branches.main, remote.branches.main)).toEqual({
      ahead: 1,
      behind: 0,
    })
    expect(aheadBehind(commits, remote.branches.main, branches.main)).toEqual({
      ahead: 0,
      behind: 1,
    })
  })
})
