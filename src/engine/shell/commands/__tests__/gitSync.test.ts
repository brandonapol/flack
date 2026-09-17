import { describe, expect, it } from 'vitest'

import { shortId } from '../../../git/hash'
import { remoteCommit, appendLine } from '../../../git/sync'
import { inRepo } from './harness'

const SLUG = 'inkwell/docs-site'

function commitAda(s: ReturnType<typeof inRepo>) {
  const local = s.state.git.local!
  s.state = {
    ...s.state,
    git: {
      ...s.state.git,
      local: {
        ...local,
        working: { ...local.working, 'team.md': `${local.working['team.md']}- Ada\n` },
      },
    },
  }
  return s.run('git commit -am "Add Ada"')
}

function samPushes(s: ReturnType<typeof inRepo>, path = 'team.md') {
  const remote = s.state.git.remotes[SLUG]
  const result = remoteCommit(remote, {
    author: { name: 'Sam Rivera', email: 'sam@inkwell.example' },
    message: 'Add Sam',
    change: appendLine(path, '- Sam Rivera'),
    timestamp: s.state.clock,
  })
  s.state = {
    ...s.state,
    git: { ...s.state.git, remotes: { ...s.state.git.remotes, [SLUG]: result.remote } },
  }
  return s
}

describe('git push', () => {
  it('pushes new commits and updates GitNub', () => {
    const s = commitAda(inRepo())
    const before = s.state.git.remotes[SLUG].branches.main
    const tip = s.state.git.local!.branches.main
    s.run('git push')
    expect(s.state.git.remotes[SLUG].branches.main).toBe(tip)
    expect(s.lastText.split('\n').slice(-2)).toEqual([
      'To https://gitnub.com/inkwell/docs-site.git',
      `   ${shortId(before)}..${shortId(tip)}  main -> main`,
    ])
    expect(s.run('git push origin main').lastText).toBe('Everything up-to-date')
  })

  it('is rejected when GitNub has moved on', () => {
    const s = samPushes(commitAda(inRepo())).run('git push')
    expect(s.lastText).toContain(' ! [rejected]        main -> main (fetch first)')
    expect(s.ok).toBe(false)
  })

  it('rejects unknown remotes', () => {
    expect(inRepo().run('git push upstream main').lastText).toContain(
      "fatal: 'upstream' does not appear to be a git repository"
    )
  })
})

describe('git pull', () => {
  it('is already up to date', () => {
    expect(inRepo().run('git pull').lastText).toBe('Already up to date.')
  })

  it('fast-forwards and updates the files', () => {
    const s = samPushes(inRepo()).run('git pull')
    expect(s.lastText).toContain('Fast-forward\n team.md | 1 +\n 1 file changed, 1 insertion(+)')
    expect(s.state.git.local!.working['team.md']).toContain('- Sam Rivera')
    expect(s.run('git pull origin main').lastText).toBe('Already up to date.')
  })

  it('refuses when a saved edit would be overwritten', () => {
    const s = samPushes(inRepo())
    const local = s.state.git.local!
    s.state = {
      ...s.state,
      git: {
        ...s.state.git,
        local: { ...local, working: { ...local.working, 'team.md': 'mine\n' } },
      },
    }
    s.run('git pull')
    expect(s.lastText).toContain(
      'error: Your local changes to the following files would be overwritten by merge:'
    )
    expect(s.state.git.local!.working['team.md']).toBe('mine\n')
    expect(s.ok).toBe(false)
  })

  it('stops on diverged history and points at Update branch', () => {
    const s = samPushes(commitAda(inRepo()), 'README.md').run('git pull')
    expect(s.lastText).toContain('fatal: Need to specify how to reconcile divergent branches.')
    expect(s.lastText).toContain('Update branch')
    expect(s.ok).toBe(false)
  })
})

describe('git fetch', () => {
  it('updates origin/main only, then status shows behind', () => {
    const s = samPushes(inRepo()).run('git fetch')
    expect(s.lastText).toMatch(
      /From https:\/\/gitnub\.com\/inkwell\/docs-site\n {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main {7}-> origin\/main$/
    )
    expect(s.run('git status').lastText).toContain(
      "Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded."
    )
    expect(s.run('git fetch').lastText).toBe('')
  })
})
