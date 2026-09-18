import { describe, expect, it } from 'vitest'

import { sandbox } from './__fixtures__/sandbox'
import {
  ancestors,
  branchCommits,
  CAPTIONS,
  cherryPick,
  merge,
  node,
  rebase,
  shapeOf,
  squash,
  type LabResult,
} from './graph'

function ok(result: LabResult) {
  if (!result.ok) throw new Error(result.kind === 'invalid' ? result.reason : 'conflict')
  return result
}

describe('rebase', () => {
  it('replays the branch’s commits on top of main’s latest, as new copies', () => {
    const { graph, caption, announcement } = ok(rebase(sandbox(), 'yours', 'm3'))
    const mine = branchCommits(graph, 'yours')
    expect(mine.map((commit) => commit.label)).toEqual([
      'Draft the intro',
      'wip',
      'Add a tip about links',
    ])
    expect(mine.map((commit) => commit.id)).toEqual(["y1'", "y2'", "y3'"])
    expect(mine.map((commit) => commit.copyOf)).toEqual(['y1', 'y2', 'y3'])
    expect(mine[0].parents).toEqual(['m3'])
    expect(mine.every((commit) => commit.lane === 'yours')).toBe(true)
    // The originals are gone.
    expect(graph.nodes.some((commit) => commit.id === 'y1')).toBe(false)
    expect(caption).toBe(CAPTIONS.rebase)
    expect(announcement).toBe('3 commits on yours now start from “Fix a typo”.')
  })

  it('says when there is nothing to do', () => {
    const once = ok(rebase(sandbox(), 'yours', 'm3')).graph
    expect(rebase(once, 'yours', 'm3')).toMatchObject({ ok: false, kind: 'invalid' })
    expect(rebase(sandbox(), 'main', 'y3')).toMatchObject({ ok: false, kind: 'invalid' })
  })

  it('conflicts when both sides touched the same spot, and a resolution goes through', () => {
    const result = rebase(sandbox(), 'yours', 's1')
    expect(result).toMatchObject({
      ok: false,
      kind: 'conflict',
      conflict: { touch: 'tips', mine: { id: 'y3' }, theirs: { id: 's1' } },
    })
    const resolved = ok(rebase(sandbox(), 'yours', 's1', { resolution: 'both' }))
    expect(resolved.resolved).toBe(
      '- Link to the page, not the heading.\n- Use sentence case for headings.'
    )
    expect(node(resolved.graph, "y3'").snippet).toBe(resolved.resolved)
  })
})

describe('merge', () => {
  it('adds a commit with two parents on the target branch', () => {
    const { graph, caption } = ok(merge(sandbox(), 'yours', 'main'))
    const joined = node(graph, graph.branches.main)
    expect(joined.parents).toEqual(['m3', 'y3'])
    expect(joined.lane).toBe('main')
    expect(joined.label).toBe('Merge yours into main')
    // Both histories are still there.
    expect(ancestors(graph, joined.id)).toEqual(
      new Set(['m1', 'm2', 'm3', 'y1', 'y2', 'y3', joined.id])
    )
    expect(caption).toBe(CAPTIONS.merge)
  })

  it('conflicts on a shared spot, not otherwise', () => {
    expect(merge(sandbox(), 'yours', 'sam')).toMatchObject({ ok: false, kind: 'conflict' })
    expect(merge(sandbox(), 'sam', 'main').ok).toBe(true)
    const theirs = ok(merge(sandbox(), 'yours', 'sam', { resolution: 'theirs' }))
    expect(theirs.resolved).toBe('- Use sentence case for headings.')
  })

  it('will not merge what is already there', () => {
    const merged = ok(merge(sandbox(), 'sam', 'main')).graph
    expect(merge(merged, 'sam', 'main')).toMatchObject({ ok: false, kind: 'invalid' })
  })
})

describe('squash', () => {
  it('collapses a run of commits into one and composes the message', () => {
    const { graph, caption, announcement } = ok(squash(sandbox(), ['y1', 'y2', 'y3']))
    const mine = branchCommits(graph, 'yours')
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      label: 'Draft the intro + wip + Add a tip about links',
      squashed: ['Draft the intro', 'wip', 'Add a tip about links'],
      parents: ['m2'],
      touches: ['intro', 'tips'],
      snippet: '- Link to the page, not the heading.',
    })
    expect(graph.branches.yours).toBe(mine[0].id)
    expect(caption).toBe(CAPTIONS.squash)
    expect(announcement).toBe('3 commits on yours are now 1.')
  })

  it('takes a message, and re-parents what came after', () => {
    const { graph } = ok(squash(sandbox(), ['y2', 'y1'], { label: 'Write the intro' }))
    const [squashed, tip] = branchCommits(graph, 'yours')
    expect(squashed.label).toBe('Write the intro')
    expect(tip.parents).toEqual([squashed.id])
  })

  it('only squashes neighbours on one branch', () => {
    expect(squash(sandbox(), ['y1', 'y3'])).toMatchObject({ ok: false, kind: 'invalid' })
    expect(squash(sandbox(), ['y3', 's1'])).toMatchObject({ ok: false, kind: 'invalid' })
    expect(squash(sandbox(), ['y1'])).toMatchObject({ ok: false, kind: 'invalid' })
  })
})

describe('cherry-pick', () => {
  it('copies one commit onto another branch and leaves its own branch alone', () => {
    const before = sandbox()
    const { graph, caption } = ok(cherryPick(before, 'y1', 'main'))
    const copy = node(graph, graph.branches.main)
    expect(copy).toMatchObject({
      lane: 'main',
      parents: ['m3'],
      copyOf: 'y1',
      label: 'Draft the intro',
    })
    expect(graph.branches.yours).toBe('y3')
    expect(branchCommits(graph, 'yours').map((commit) => commit.id)).toEqual(['y1', 'y2', 'y3'])
    expect(caption).toBe(CAPTIONS.cherryPick)
  })

  it('conflicts when the target branch changed the same spot since', () => {
    expect(cherryPick(sandbox(), 'y3', 'sam')).toMatchObject({ ok: false, kind: 'conflict' })
    expect(cherryPick(sandbox(), 'y1', 'sam').ok).toBe(true)
    expect(cherryPick(sandbox(), 'm2', 'yours')).toMatchObject({ ok: false, kind: 'invalid' })
  })
})

describe('shapeOf', () => {
  it('matches when two graphs have the same shape, whatever the ids', () => {
    const squashed = ok(squash(sandbox(), ['y1', 'y2', 'y3'])).graph
    const rebased = ok(rebase(squashed, 'yours', 'm3')).graph
    expect(shapeOf(rebased)).toContain('yours: yours < main < main < main')
    expect(shapeOf(rebased)).not.toBe(shapeOf(sandbox()))
    const otherWay = ok(
      squash(ok(rebase(sandbox(), 'yours', 'm3')).graph, ["y1'", "y2'", "y3'"])
    ).graph
    expect(shapeOf(otherWay)).toBe(shapeOf(rebased))
  })

  it('marks merge commits', () => {
    expect(shapeOf(ok(merge(sandbox(), 'sam', 'main')).graph)).toContain('main: main* < main')
  })
})
