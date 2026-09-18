import {
  ancestors,
  cherryPick,
  merge,
  node,
  rebase,
  squash,
  type LabGraph,
  type LabNode,
  type LabResult,
  type Resolution,
} from '../../engine/lab/graph'

export type LabActionId = 'rebase' | 'merge' | 'squash' | 'cherryPick'

export interface LabAction {
  id: LabActionId
  label: string
  run: (resolution?: Resolution) => LabResult
}

/** Branches whose newest commit is `id`. */
export function tipsOf(graph: LabGraph, id: string): string[] {
  return Object.entries(graph.branches)
    .filter(([, tip]) => tip === id)
    .map(([branch]) => branch)
}

/** The commits from `a` to `b` along one branch, if one is behind the other. */
function run(graph: LabGraph, a: string, b: string): string[] | undefined {
  const [older, newer] = ancestors(graph, b).has(a) ? [a, b] : [b, a]
  const ids: string[] = []
  let id: string | undefined = newer
  while (id) {
    ids.push(id)
    if (id === older) return ids.reverse()
    id = node(graph, id).parents[0]
  }
  return undefined
}

/**
 * What can happen when commit `source` is dropped on commit `target`: the menu the learner picks
 * from, by drag or by keyboard. Only actions that would do something are offered.
 */
export function actionsFor(
  graph: LabGraph,
  source: string,
  target: string,
  options: { squashLabel?: string } = {}
): LabAction[] {
  if (source === target) return []
  const from = node(graph, source)
  const to = node(graph, target)
  const targetBranches = tipsOf(graph, target)
  const candidates: LabAction[] = []

  if (from.lane !== 'main') {
    candidates.push({
      id: 'rebase',
      label: 'Rebase onto here',
      run: (resolution) => rebase(graph, from.lane, target, { resolution }),
    })
  }
  for (const branch of targetBranches.filter((name) => name !== from.lane)) {
    candidates.push({
      id: 'merge',
      label: targetBranches.length > 1 ? `Merge with here (${branch})` : 'Merge with here',
      run: (resolution) => merge(graph, from.lane, branch, { resolution }),
    })
  }
  // Squashing is for tidying your own branch; main's history is shared, so it stays as it is.
  if (from.lane === to.lane && from.lane !== 'main') {
    const ids = run(graph, source, target)
    if (ids) {
      candidates.push({
        id: 'squash',
        label: 'Squash into here',
        run: () => squash(graph, ids, { label: options.squashLabel }),
      })
    }
  }
  for (const branch of targetBranches.filter((name) => name !== from.lane)) {
    candidates.push({
      id: 'cherryPick',
      label: targetBranches.length > 1 ? `Cherry-pick to here (${branch})` : 'Cherry-pick to here',
      run: (resolution) => cherryPick(graph, source, branch, { resolution }),
    })
  }

  return candidates.filter((action) => {
    const result = action.run()
    return result.ok || result.kind === 'conflict'
  })
}

/** A commit in words, for screen readers. */
export function describeNode(graph: LabGraph, node: LabNode): string {
  const tips = tipsOf(graph, node.id)
  return [
    node.label,
    `by ${node.author}`,
    `on ${node.lane}`,
    node.copyOf ? 'a new copy' : '',
    node.squashed ? `squashed from ${node.squashed.length} commits` : '',
    tips.length > 0 ? `newest on ${tips.join(' and ')}` : '',
  ]
    .filter(Boolean)
    .join(', ')
}
