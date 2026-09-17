import { describe, expect, it } from 'vitest'

import { HOME } from '../state'
import { clonedState, freshState } from './__fixtures__/state'
import { changeDirectory, displayPath, lookup, repoPath, resolvePath } from './fs'
import { promptFor } from './prompt'

describe('paths', () => {
  it('resolves relative, parent, home and absolute paths', () => {
    expect(resolvePath(HOME, 'docs-site/docs')).toBe(`${HOME}/docs-site/docs`)
    expect(resolvePath(`${HOME}/docs-site/docs`, '../..')).toBe(HOME)
    expect(resolvePath(`${HOME}/docs-site`, '~')).toBe(HOME)
    expect(resolvePath(`${HOME}/docs-site`)).toBe(HOME)
    expect(resolvePath(HOME, '~/docs-site/')).toBe(`${HOME}/docs-site`)
    expect(resolvePath(HOME, '/Users/you/./docs-site')).toBe(`${HOME}/docs-site`)
    expect(resolvePath('/', '../../..')).toBe('/')
  })

  it('shows home as ~', () => {
    expect(displayPath(HOME)).toBe('~')
    expect(displayPath(`${HOME}/docs-site/docs`)).toBe('~/docs-site/docs')
    expect(displayPath('/Users')).toBe('/Users')
  })
})

describe('lookup', () => {
  it('home is empty before cloning', () => {
    expect(lookup(freshState(), HOME)).toEqual({ type: 'dir', path: HOME, entries: [] })
    expect(lookup(freshState(), `${HOME}/docs-site`)).toBeUndefined()
  })

  it('infers folders from working file paths, with a hidden .git', () => {
    const state = clonedState()
    expect(lookup(state, HOME)).toMatchObject({ entries: [{ name: 'docs-site', type: 'dir' }] })
    expect(lookup(state, `${HOME}/docs-site`)).toMatchObject({
      type: 'dir',
      entries: [
        { name: '.git', type: 'dir' },
        { name: 'README.md', type: 'file' },
        { name: 'docs', type: 'dir' },
        { name: 'team.md', type: 'file' },
      ],
    })
    expect(lookup(state, `${HOME}/docs-site/docs`)).toMatchObject({
      entries: [{ name: 'welcome.md', type: 'file' }],
    })
    expect(lookup(state, `${HOME}/docs-site/team.md`)).toMatchObject({ type: 'file' })
    expect(lookup(state, `${HOME}/docs-site/.git/HEAD`)).toMatchObject({
      content: 'ref: refs/heads/main\n',
    })
    expect(lookup(state, `${HOME}/docs-site/nope`)).toBeUndefined()
  })

  it('knows whether a path is inside the repo', () => {
    const state = clonedState()
    expect(repoPath(state, `${HOME}/docs-site`)).toBe('')
    expect(repoPath(state, `${HOME}/docs-site/docs/welcome.md`)).toBe('docs/welcome.md')
    expect(repoPath(state, HOME)).toBeUndefined()
    expect(repoPath(state, `${HOME}/docs-site-other`)).toBeUndefined()
  })
})

describe('cd', () => {
  it('moves into nested folders and back out', () => {
    const state = clonedState()
    const into = changeDirectory(state, 'docs-site/docs')
    expect(into).toEqual({ ok: true, cwd: `${HOME}/docs-site/docs` })
    const back = changeDirectory(
      { ...state, shell: { ...state.shell, cwd: `${HOME}/docs-site/docs` } },
      '../..'
    )
    expect(back).toEqual({ ok: true, cwd: HOME })
  })

  it('uses zsh wording for missing folders and files', () => {
    const state = clonedState(`${HOME}/docs-site`)
    expect(changeDirectory(state, 'nope')).toEqual({
      ok: false,
      message: 'cd: no such file or directory: nope',
    })
    expect(changeDirectory(state, 'team.md')).toEqual({
      ok: false,
      message: 'cd: not a directory: team.md',
    })
  })

  it('cannot enter the repo before it is cloned', () => {
    expect(changeDirectory(freshState(), 'docs-site')).toMatchObject({ ok: false })
  })
})

describe('prompt', () => {
  it('shows the folder, and the branch inside a repo', () => {
    expect(promptFor(freshState())).toBe('~ $')
    expect(promptFor(clonedState())).toBe('~ $')
    expect(promptFor(clonedState(`${HOME}/docs-site`))).toBe('~/docs-site (main) $')
    expect(promptFor(clonedState(`${HOME}/docs-site/docs`))).toBe('~/docs-site/docs (main) $')
  })

  it('shows commits waiting to be pushed', () => {
    const state = clonedState(`${HOME}/docs-site`)
    const local = state.git.local!
    const ahead = {
      ...state,
      git: {
        ...state.git,
        local: {
          ...local,
          remoteBranches: {
            main: Object.keys(local.commits).find((id) => id !== local.branches.main)!,
          },
        },
      },
    }
    expect(promptFor(ahead)).toBe('~/docs-site (main ↑1) $')
  })

  it('falls back to home when the folder is gone', () => {
    expect(
      promptFor({ ...freshState(), shell: { cwd: `${HOME}/docs-site`, history: [], output: [] } })
    ).toBe('~ $')
  })
})
