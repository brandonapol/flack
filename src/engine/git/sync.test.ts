import { describe, expect, it } from 'vitest'

import { plainText } from '../lines'
import { ada, docsSite, sam, T0 } from './__fixtures__/docsSite'
import { shortId } from './hash'
import { clone, commit, headCommit, stage } from './repo'
import { getStatus, isClean } from './status'
import { appendLine, fastForward, fetch, pull, push, remoteCommit, replaceText } from './sync'
import { formatFetch, formatPull, formatPush } from './syncOutput'
import type { LocalRepo, RemoteRepo } from './types'

const SLUG = 'inkwell/docs-site'

function commitEdit(local: LocalRepo, path: string, text: string, at = T0 + 600): LocalRepo {
  const edited = appendLine(path, text)(local.working)
  const staged = stage({ ...local, working: edited }, [path])
  if (!staged.ok) throw new Error()
  const result = commit(staged.local, { message: `Add ${text}`, config: ada, timestamp: at })
  if (!result.ok) throw new Error(result.error)
  return result.local
}

function samPushes(remote: RemoteRepo, at = T0 + 900): RemoteRepo {
  return remoteCommit(remote, {
    author: sam,
    message: 'Add Sam to team list',
    change: appendLine('team.md', '- Sam Rivera'),
    timestamp: at,
  }).remote
}

describe('push', () => {
  it('fast-forwards the remote and origin/main after a commit', () => {
    const remote = docsSite()
    const local = commitEdit(clone(remote), 'team.md', '- Ada')
    const result = push(local, remote)
    if (result.kind !== 'pushed') throw new Error(result.kind)
    expect(result.remote.branches.main).toBe(local.branches.main)
    expect(result.remote.commits[local.branches.main]).toBeDefined()
    expect(result.local.remoteBranches.main).toBe(local.branches.main)
    expect(getStatus(result.local).upstream).toMatchObject({ ahead: 0, behind: 0 })
    // $ git push
    // To https://gitnub.com/inkwell/docs-site.git
    //    60b1167..b5e5125  main -> main
    expect(plainText(formatPush(result, SLUG)).split('\n').slice(-2)).toEqual([
      'To https://gitnub.com/inkwell/docs-site.git',
      `   ${shortId(remote.branches.main)}..${shortId(local.branches.main)}  main -> main`,
    ])
  })

  it('says everything is up to date when there is nothing new', () => {
    const remote = docsSite()
    const result = push(clone(remote), remote)
    expect(result.kind).toBe('up-to-date')
    expect(plainText(formatPush(result, SLUG))).toBe('Everything up-to-date')
  })

  it('is rejected (fetch first) when GitNub has commits we have never seen', () => {
    const remote = docsSite()
    const local = commitEdit(clone(remote), 'team.md', '- Ada')
    const result = push(local, samPushes(remote))
    expect(result).toMatchObject({ ok: false, kind: 'rejected', reason: 'fetch-first' })
    expect(plainText(formatPush(result, SLUG))).toBe(
      `To https://gitnub.com/inkwell/docs-site.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to 'https://gitnub.com/inkwell/docs-site.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref. If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.`
    )
  })

  it('is rejected (non-fast-forward) after fetching but not integrating', () => {
    const remote = samPushes(docsSite())
    const local = fetch(commitEdit(clone(docsSite()), 'team.md', '- Ada'), remote).local
    const result = push(local, remote)
    expect(result).toMatchObject({ ok: false, reason: 'non-fast-forward' })
    expect(plainText(formatPush(result, SLUG))).toContain(
      ' ! [rejected]        main -> main (non-fast-forward)'
    )
  })

  it('push -u creates a remote branch, sets upstream, and prints the pull request nudge', () => {
    const remote = docsSite()
    const onBranch: LocalRepo = (() => {
      const base = clone(remote)
      return {
        ...base,
        head: 'ada-team-list',
        branches: { ...base.branches, 'ada-team-list': base.branches.main },
      }
    })()
    const local = commitEdit(onBranch, 'team.md', '- Ada')

    expect(push(local, remote)).toEqual({ ok: false, kind: 'no-upstream', branch: 'ada-team-list' })
    expect(getStatus(local).upstream).toBeUndefined()

    const result = push(local, remote, { branch: 'ada-team-list', setUpstream: true })
    if (result.kind !== 'pushed') throw new Error(result.kind)
    expect(result.remote.branches['ada-team-list']).toBe(local.branches['ada-team-list'])
    expect(result.remote.branches.main).toBe(remote.branches.main)
    expect(result.local.upstreams['ada-team-list']).toBe('ada-team-list')
    expect(getStatus(result.local).upstream).toEqual({
      name: 'origin/ada-team-list',
      gone: false,
      ahead: 0,
      behind: 0,
    })
    expect(plainText(formatPush(result, SLUG).filter((l) => l.tone !== 'muted'))).toBe(
      `remote: 
remote: Create a pull request for 'ada-team-list' on GitNub by visiting:
remote:      https://gitnub.com/inkwell/docs-site/pull/new/ada-team-list
remote: 
To https://gitnub.com/inkwell/docs-site.git
 * [new branch]      ada-team-list -> ada-team-list
branch 'ada-team-list' set up to track 'origin/ada-team-list'.`
    )
  })

  it('explains a missing upstream like Git', () => {
    expect(
      plainText(formatPush({ ok: false, kind: 'no-upstream', branch: 'ada-team-list' }, SLUG))
    ).toBe(
      `fatal: The current branch ada-team-list has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream origin ada-team-list

To have this happen automatically for branches without a tracking
upstream, see 'push.autoSetupRemote' in 'git help config'.
`
    )
  })
})

describe('fetch', () => {
  it("updates origin/main but not main or the learner's files", () => {
    const local = clone(docsSite())
    const remote = samPushes(docsSite())
    const result = fetch(local, remote)
    expect(result.local.remoteBranches.main).toBe(remote.branches.main)
    expect(result.local.branches.main).toBe(local.branches.main)
    expect(result.local.working).toEqual(local.working)
    expect(getStatus(result.local).upstream).toMatchObject({ ahead: 0, behind: 1 })
  })

  it('prints what moved, with Git column widths, and nothing when nothing moved', () => {
    const base = docsSite()
    const local = clone(base)
    expect(formatFetch(fetch(local, base), SLUG)).toEqual([])

    let remote = samPushes(base)
    remote = remoteCommit(remote, {
      author: sam,
      message: 'tip',
      change: appendLine('docs/welcome.md', 'tip'),
      timestamp: T0 + 1000,
      branch: 'sam-tip',
    }).remote
    const result = fetch(local, remote)
    // From ../origin
    //    d3e3be8..aba3f38  main       -> origin/main
    //  * [new branch]      sam-tip    -> origin/sam-tip
    expect(plainText(formatFetch(result, SLUG).filter((l) => l.tone !== 'muted'))).toBe(
      `From https://gitnub.com/inkwell/docs-site
   ${shortId(base.branches.main)}..${shortId(remote.branches.main)}  main       -> origin/main
 * [new branch]      sam-tip    -> origin/sam-tip`
    )
  })

  it('keeps stale remote-tracking refs unless pruning', () => {
    const remote = docsSite()
    const local = {
      ...clone(remote),
      remoteBranches: { ...clone(remote).remoteBranches, gone: remote.branches.main },
    }
    expect(fetch(local, remote).local.remoteBranches.gone).toBeDefined()
    const pruned = fetch(local, remote, { prune: true })
    expect(pruned.local.remoteBranches.gone).toBeUndefined()
    expect(pruned.pruned).toEqual(['gone'])
  })
})

describe('pull (fast-forward)', () => {
  it('is already up to date when nothing changed', () => {
    const remote = docsSite()
    const result = pull(clone(remote), remote)
    expect(result.kind).toBe('up-to-date')
    expect(plainText(formatPull(result, SLUG))).toBe('Already up to date.')
  })

  it("fast-forwards main, the index and the learner's files", () => {
    const local = clone(docsSite())
    const remote = samPushes(docsSite())
    const result = pull(local, remote)
    if (result.kind !== 'fast-forward') throw new Error(result.kind)
    expect(result.local.branches.main).toBe(remote.branches.main)
    expect(result.local.working['team.md']).toContain('- Sam Rivera')
    expect(isClean(getStatus(result.local))).toBe(true)
    expect(headCommit(result.local).author).toEqual(sam)
    // Updating b5e5125..ef31b88
    // Fast-forward
    //  team.md | 1 +
    //  1 file changed, 1 insertion(+)
    expect(
      plainText(formatPull(result, SLUG).filter((l) => l.tone !== 'muted'))
        .split('\n')
        .slice(-4)
    ).toEqual([
      `Updating ${shortId(local.branches.main)}..${shortId(remote.branches.main)}`,
      'Fast-forward',
      ' team.md | 1 +',
      ' 1 file changed, 1 insertion(+)',
    ])
  })

  it('refuses when a local edit overlaps an incoming change, but still fetches', () => {
    const base = clone(docsSite())
    const local = {
      ...base,
      working: { ...base.working, 'team.md': `${base.working['team.md']}dirty\n` },
    }
    const remote = samPushes(docsSite())
    const result = pull(local, remote)
    expect(result).toMatchObject({ ok: false, kind: 'would-overwrite', paths: ['team.md'] })
    if (result.kind !== 'would-overwrite') throw new Error()
    expect(result.local.remoteBranches.main).toBe(remote.branches.main)
    expect(result.local.branches.main).toBe(base.branches.main)
    expect(plainText(formatPull(result, SLUG)).split('\n').slice(-5)).toEqual([
      `Updating ${shortId(base.branches.main)}..${shortId(remote.branches.main)}`,
      'error: Your local changes to the following files would be overwritten by merge:',
      '\tteam.md',
      'Please commit your changes or stash them before you merge.',
      'Aborting',
    ])
  })

  it('refuses for a staged overlapping change too', () => {
    const base = clone(docsSite())
    const staged = stage({ ...base, working: { ...base.working, 'team.md': 'x\n' } }, ['team.md'])
    if (!staged.ok) throw new Error()
    expect(pull(staged.local, samPushes(docsSite()))).toMatchObject({ kind: 'would-overwrite' })
  })

  it('carries a non-overlapping edit along', () => {
    const base = clone(docsSite())
    const local = { ...base, working: { ...base.working, 'docs/welcome.md': 'Hello\n' } }
    const result = pull(local, samPushes(docsSite()))
    if (result.kind !== 'fast-forward') throw new Error(result.kind)
    expect(result.local.working['docs/welcome.md']).toBe('Hello\n')
    expect(getStatus(result.local).unstaged).toEqual([
      { path: 'docs/welcome.md', kind: 'modified' },
    ])
  })

  it('reports diverged history without touching the branch', () => {
    const local = commitEdit(clone(docsSite()), 'docs/welcome.md', 'mine')
    const remote = samPushes(docsSite())
    const result = pull(local, remote)
    expect(result.kind).toBe('diverged')
    if (result.kind !== 'diverged') throw new Error()
    expect(result.local.branches.main).toBe(local.branches.main)
    expect(getStatus(result.local).upstream).toMatchObject({ ahead: 1, behind: 1 })
    expect(plainText(formatPull(result, SLUG))).toContain(
      'fatal: Need to specify how to reconcile divergent branches.'
    )
  })

  it('explains a branch with no tracking information', () => {
    const base = clone(docsSite())
    const local = {
      ...base,
      head: 'feature',
      branches: { ...base.branches, feature: base.branches.main },
    }
    const result = pull(local, docsSite())
    expect(result).toEqual({ ok: false, kind: 'no-tracking', branch: 'feature' })
    expect(plainText(formatPull(result, SLUG))).toContain(
      'git branch --set-upstream-to=origin/<branch> feature'
    )
  })

  it('refuses to overwrite an untracked file that GitNub now has', () => {
    const base = clone(docsSite())
    const remote = remoteCommit(docsSite(), {
      author: sam,
      message: 'notes',
      change: (tree) => ({ ...tree, 'notes.md': 'theirs\n' }),
      timestamp: T0 + 900,
    }).remote
    const local = fetch(
      { ...base, working: { ...base.working, 'notes.md': 'mine\n' } },
      remote
    ).local
    expect(fastForward(local, remote.branches.main)).toMatchObject({
      ok: false,
      kind: 'untracked-would-overwrite',
      paths: ['notes.md'],
    })
  })
})

describe('scripted coworker commits', () => {
  it('build on the current remote tree', () => {
    const remote = docsSite()
    const afterAda = push(commitEdit(clone(remote), 'team.md', '- Ada'), remote)
    if (afterAda.kind !== 'pushed') throw new Error()
    const { remote: afterSam, commit: samCommit } = remoteCommit(afterAda.remote, {
      author: sam,
      message: 'Add Sam',
      change: appendLine('team.md', '- Sam Rivera'),
      timestamp: T0 + 1200,
    })
    expect(samCommit.parents).toEqual([afterAda.remote.branches.main])
    expect(afterSam.commits[afterSam.branches.main].tree['team.md']).toMatch(
      /- Ada\n- Sam Rivera\n$/
    )
  })

  it('replaceText fails loudly when content drifts', () => {
    expect(() => replaceText('team.md', 'nope', 'x')({ 'team.md': 'hi' })).toThrow(/not found/)
    expect(replaceText('team.md', 'hi', 'bye')({ 'team.md': 'hi' })).toEqual({ 'team.md': 'bye' })
  })
})
