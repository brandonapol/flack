import { describe, expect, it } from 'vitest'

import { ada, docsSite, sam, T0, TEAM_MD } from './__fixtures__/docsSite'
import {
  commitsToReplay,
  findMergeBase,
  merge,
  mergeText,
  mergeTrees,
  rebase,
  renderMarkers,
  resolveConflict,
  type ConflictedFile,
  type MergeOptions,
} from './merge'
import { clone, commit, headCommit, headId, isAncestor, log, stage } from './repo'
import { getStatus } from './status'
import { appendLine, fetch, push, remoteCommit, replaceText } from './sync'
import type { FileTree, LocalRepo, RemoteRepo } from './types'

const author = { name: 'Ada', email: 'ada@inkwell.example' }
const mergeOptions: MergeOptions = {
  message: "Merge remote-tracking branch 'origin/main'",
  author,
  timestamp: T0 + 1200,
}

function commitChange(
  local: LocalRepo,
  change: (tree: FileTree) => FileTree,
  message: string,
  at = T0 + 600
): LocalRepo {
  const edited = change(local.working)
  const paths = Object.keys({ ...local.working, ...edited }).filter(
    (path) => edited[path] !== local.working[path]
  )
  const staged = stage({ ...local, working: edited }, paths)
  if (!staged.ok) throw new Error()
  const result = commit(staged.local, { message, config: ada, timestamp: at })
  if (!result.ok) throw new Error(result.error)
  return result.local
}

function samChanges(
  remote: RemoteRepo,
  change: (tree: FileTree) => FileTree,
  at = T0 + 900
): RemoteRepo {
  return remoteCommit(remote, { author: sam, message: 'Sam’s change', change, timestamp: at })
    .remote
}

/** Ada adds her name at the bottom of team.md; Sam renames the heading. Different lines. */
function diverged(samChange = replaceText('team.md', '# Docs team', '# The docs team')) {
  const remote = samChanges(docsSite(), samChange)
  const mine = commitChange(clone(docsSite()), appendLine('team.md', '- Ada'), 'Add Ada')
  const local = fetch(mine, remote).local
  return { remote, local, theirs: local.remoteBranches.main }
}

describe('mergeText', () => {
  const base = 'one\ntwo\nthree\nfour\nfive\n'

  it('takes a one-sided change', () => {
    expect(mergeText(base, base, 'one\nTWO\nthree\nfour\nfive\n')).toEqual({
      ok: true,
      text: 'one\nTWO\nthree\nfour\nfive\n',
    })
  })

  it('combines changes to different lines of the same file', () => {
    expect(
      mergeText(base, 'ONE\ntwo\nthree\nfour\nfive\n', 'one\ntwo\nthree\nfour\nFIVE\n')
    ).toEqual({ ok: true, text: 'ONE\ntwo\nthree\nfour\nFIVE\n' })
  })

  it('reports the same lines changed on both sides as a conflict, with both versions', () => {
    const result = mergeText(
      base,
      'one\nTwo!\nthree\nfour\nfive\n',
      'one\nTWO\nthree\nfour\nfive\n'
    )
    expect(result).toEqual({
      ok: false,
      hunks: [{ ours: ['Two!'], theirs: ['TWO'], context: ['two'] }],
      chunks: [['one'], 0, ['three', 'four', 'five', '']],
    })
  })

  it('two lines added at the same place conflict (the Chapter 8 case)', () => {
    const result = mergeText(TEAM_MD, `${TEAM_MD}- Ada\n`, `${TEAM_MD}- Sam Rivera\n`)
    expect(result).toMatchObject({
      ok: false,
      hunks: [{ ours: ['- Ada'], theirs: ['- Sam Rivera'], context: [] }],
    })
  })
})

describe('mergeTrees', () => {
  const base = { 'a.md': 'a\n', 'b.md': 'b\n' }

  it('keeps new files and deletions from either side', () => {
    const result = mergeTrees(base, { ...base, 'new.md': 'new\n' }, { 'a.md': 'a\n' })
    expect(result).toEqual({ ok: true, tree: { 'a.md': 'a\n', 'new.md': 'new\n' } })
  })

  it('a file changed on one side and deleted on the other is a conflict', () => {
    const result = mergeTrees(base, { ...base, 'b.md': 'B\n' }, { 'a.md': 'a\n' })
    expect(result).toEqual({
      tree: { 'a.md': 'a\n' },
      ok: false,
      conflicts: [
        {
          path: 'b.md',
          hunks: [{ ours: ['B'], theirs: [], context: ['b'] }],
          chunks: [0],
          deletedBy: 'theirs',
        },
      ],
    })
  })
})

describe('findMergeBase', () => {
  it('finds where two branches split', () => {
    const { local, theirs } = diverged()
    expect(findMergeBase(local.commits, headId(local), theirs)).toBe(docsSite().branches.main)
  })
})

describe('merge', () => {
  it('diverged status says so', () => {
    const { local } = diverged()
    expect(getStatus(local).upstream).toMatchObject({ ahead: 1, behind: 1 })
  })

  it('makes a merge commit with two parents when the same file changed on different lines', () => {
    const { local, theirs } = diverged()
    const result = merge(local, theirs, mergeOptions)
    if (result.kind !== 'merge') throw new Error(result.kind)
    const created = headCommit(result.local)
    expect(created.parents).toEqual([headId(local), theirs])
    expect(created.message).toBe("Merge remote-tracking branch 'origin/main'")
    expect(result.local.working['team.md']).toBe(
      TEAM_MD.replace('# Docs team', '# The docs team') + '- Ada\n'
    )
    expect(result.local.index).toEqual(created.tree)
    expect(result.stats).toEqual([
      { path: 'team.md', kind: 'modified', insertions: 1, deletions: 1 },
    ])
    expect(getStatus(result.local).upstream).toMatchObject({ ahead: 2, behind: 0 })
  })

  it('then pushes cleanly', () => {
    const { local, remote, theirs } = diverged()
    const merged = merge(local, theirs, mergeOptions)
    if (!merged.ok) throw new Error()
    const pushed = push(merged.local, remote)
    expect(pushed.kind).toBe('pushed')
  })

  it('fast-forwards when there is nothing of ours to merge', () => {
    const remote = samChanges(docsSite(), appendLine('team.md', '- Sam'))
    const local = fetch(clone(docsSite()), remote).local
    const result = merge(local, local.remoteBranches.main, mergeOptions)
    expect(result.kind).toBe('fast-forward')
    if (!result.ok) throw new Error()
    expect(headId(result.local)).toBe(remote.branches.main)
  })

  it('is already up to date when theirs is already in our history', () => {
    const local = commitChange(clone(docsSite()), appendLine('team.md', '- Ada'), 'Add Ada')
    expect(merge(local, local.remoteBranches.main, mergeOptions).kind).toBe('up-to-date')
  })

  it('refuses when an uncommitted edit touches a file the merge changes', () => {
    const { local, theirs } = diverged()
    const dirty = { ...local, working: { ...local.working, 'team.md': 'scribble\n' } }
    expect(merge(dirty, theirs, mergeOptions)).toEqual({
      ok: false,
      kind: 'would-overwrite',
      paths: ['team.md'],
    })
  })

  it('carries an unrelated uncommitted edit through the merge', () => {
    const { local, theirs } = diverged()
    const dirty = { ...local, working: { ...local.working, 'README.md': 'draft\n' } }
    const result = merge(dirty, theirs, mergeOptions)
    if (!result.ok) throw new Error()
    expect(result.local.working['README.md']).toBe('draft\n')
  })

  it('reports a conflict and changes nothing', () => {
    const { local, theirs } = diverged(appendLine('team.md', '- Sam Rivera'))
    const result = merge(local, theirs, mergeOptions)
    expect(result).toMatchObject({
      ok: false,
      kind: 'conflict',
      conflicts: [
        { path: 'team.md', hunks: [{ ours: ['- Ada'], theirs: ['- Sam Rivera'], context: [] }] },
      ],
    })
  })
})

describe('rebase', () => {
  it('replays our commits on top, giving a straight line with new ids', () => {
    const { local, theirs } = diverged()
    const result = rebase(local, theirs, { timestamp: T0 + 1500 })
    if (result.kind !== 'rebased') throw new Error(result.kind)

    const history = log(result.local.commits, headId(result.local))
    expect(history.map((c) => c.message)).toEqual([
      'Add Ada',
      'Sam’s change',
      'Add team list',
      'Start the docs site',
    ])
    expect(history.every((c) => c.parents.length <= 1)).toBe(true)
    expect(result.replayed).toHaveLength(1)
    expect(result.replayed[0].id).not.toBe(headId(local))
    expect(result.replayed[0].parents).toEqual([theirs])
    expect(result.local.working['team.md']).toBe(
      TEAM_MD.replace('# Docs team', '# The docs team') + '- Ada\n'
    )
    expect(getStatus(result.local).upstream).toMatchObject({ ahead: 1, behind: 0 })
  })

  it('then pushes cleanly', () => {
    const { local, remote, theirs } = diverged()
    const rebased = rebase(local, theirs)
    if (!rebased.ok) throw new Error()
    expect(push(rebased.local, remote).kind).toBe('pushed')
  })

  it('needs a clean working tree', () => {
    const { local, theirs } = diverged()
    const unstaged = { ...local, working: { ...local.working, 'README.md': 'draft\n' } }
    expect(rebase(unstaged, theirs)).toEqual({ ok: false, kind: 'unstaged-changes' })
    const staged = { ...unstaged, index: unstaged.working }
    expect(rebase(staged, theirs)).toEqual({ ok: false, kind: 'staged-changes' })
  })

  it('is up to date, or fast-forwards, when the histories have not diverged', () => {
    const local = commitChange(clone(docsSite()), appendLine('team.md', '- Ada'), 'Add Ada')
    expect(rebase(local, local.remoteBranches.main).kind).toBe('up-to-date')

    const remote = samChanges(docsSite(), appendLine('team.md', '- Sam'))
    const behind = fetch(clone(docsSite()), remote).local
    const result = rebase(behind, behind.remoteBranches.main)
    expect(result.kind).toBe('fast-forward')
    if (!result.ok) throw new Error()
    expect(headId(result.local)).toBe(remote.branches.main)
  })

  it('stops on a conflict without changing anything', () => {
    const { local, theirs } = diverged(appendLine('team.md', '- Sam Rivera'))
    const result = rebase(local, theirs)
    if (result.kind !== 'conflict') throw new Error(result.kind)
    expect(result.commit.message).toBe('Add Ada')
    expect(result.conflicts[0].path).toBe('team.md')
  })

  it('leaves merge commits out of the replay', () => {
    const { local, theirs } = diverged()
    const merged = merge(local, theirs, mergeOptions)
    if (!merged.ok) throw new Error()
    const toReplay = commitsToReplay(
      merged.local.commits,
      docsSite().branches.main,
      headId(merged.local)
    )
    expect(toReplay.map((c) => c.message)).toEqual(['Add Ada', 'Sam’s change'])
    expect(isAncestor(merged.local.commits, theirs, headId(merged.local))).toBe(true)
  })
})

describe('resolveConflict', () => {
  const both = mergeTrees(
    { 'team.md': TEAM_MD },
    { 'team.md': `${TEAM_MD}- Ada\n` },
    {
      'team.md': `${TEAM_MD}- Sam Rivera\n`,
    }
  )
  if (both.ok) throw new Error('expected a conflict')
  const [file] = both.conflicts

  it('keeps mine, theirs, or both (mine first)', () => {
    expect(resolveConflict(file, 'ours')).toBe(`${TEAM_MD}- Ada\n`)
    expect(resolveConflict(file, 'theirs')).toBe(`${TEAM_MD}- Sam Rivera\n`)
    expect(resolveConflict(file, 'both')).toBe(`${TEAM_MD}- Ada\n- Sam Rivera\n`)
  })

  it('takes one choice per hunk', () => {
    const result = mergeText('a\nb\nc\nd\ne\n', 'A1\nb\nc\nd\nE1\n', 'A2\nb\nc\nd\nE2\n')
    if (result.ok) throw new Error()
    const two: ConflictedFile = { path: 'x.md', ...result }
    expect(resolveConflict(two, ['ours', 'theirs'])).toBe('A1\nb\nc\nd\nE2\n')
  })

  it('a modify/delete conflict keeps the file or deletes it', () => {
    const deleted = mergeTrees({ 'a.md': 'a\n' }, { 'a.md': 'A\n' }, {})
    if (deleted.ok) throw new Error()
    const [conflict] = deleted.conflicts
    expect(resolveConflict(conflict, 'ours')).toBe('A\n')
    expect(resolveConflict(conflict, 'theirs')).toBeUndefined()
    expect(resolveConflict(conflict, 'both')).toBe('A\n')
  })
})

describe('renderMarkers', () => {
  it('matches the markers real Git writes', () => {
    const result = mergeTrees(
      { 'team.md': TEAM_MD },
      { 'team.md': `${TEAM_MD}- Ada\n` },
      {
        'team.md': `${TEAM_MD}- Sam Rivera\n`,
      }
    )
    if (result.ok) throw new Error()
    // $ git merge other && cat team.md   (git 2.50)
    expect(renderMarkers(result.conflicts[0], { ours: 'HEAD', theirs: 'other' })).toBe(
      `${TEAM_MD}<<<<<<< HEAD\n- Ada\n=======\n- Sam Rivera\n>>>>>>> other\n`
    )
  })
})
