/**
 * The Commit Lab's model: a small commit graph learners rearrange by hand. No file contents and no
 * diffing — each commit just says which part of the document it changed (`touches`), and two
 * commits touching the same part conflict. Every operation returns a new graph and a caption.
 */

export interface LabNode {
  id: string
  label: string
  /** Initials shown in the circle. */
  author: string
  /** The branch it was made on. `main` is always the bottom lane. */
  lane: string
  parents: string[]
  /** Which parts of the document it changed. */
  touches: string[]
  /** The line it wrote there, shown in the conflict callout. */
  snippet?: string
  /** Set on a rebased or cherry-picked copy: the commit it copies. */
  copyOf?: string
  /** Set on a squash commit: the labels of the commits it replaced, oldest first. */
  squashed?: string[]
}

export interface LabGraph {
  nodes: LabNode[]
  /** Branch → the id of its newest commit. Always has `main`. */
  branches: Record<string, string>
  /** Branches bottom to top. `main` first. */
  lanes: string[]
}

export type Resolution = 'mine' | 'theirs' | 'both'

/** Two commits being combined changed the same spot. "Mine" is the one being moved. */
export interface LabConflict {
  touch: string
  mine: LabNode
  theirs: LabNode
}

export type LabResult =
  | { ok: true; graph: LabGraph; caption: string; announcement: string; resolved?: string }
  | { ok: false; kind: 'conflict'; conflict: LabConflict }
  | { ok: false; kind: 'invalid'; reason: string }

export const CAPTIONS = {
  rebase: 'Rebase replays your commits on top of the latest work — same changes, new commits.',
  merge: 'Merge keeps both histories and adds a commit that joins them.',
  squash: 'Squash turns several small commits into one clean one before it joins main.',
  cherryPick: 'Cherry-pick copies one commit without bringing the rest of its branch along.',
} as const

// ---------------------------------------------------------------- helpers

export function node(graph: LabGraph, id: string): LabNode {
  const found = graph.nodes.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No commit ${id} in the lab graph`)
  return found
}

/** `id` and everything behind it. */
export function ancestors(graph: LabGraph, id: string): Set<string> {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length > 0) {
    const next = stack.pop()!
    if (seen.has(next)) continue
    seen.add(next)
    stack.push(...node(graph, next).parents)
  }
  return seen
}

/** Commits reachable from `tip` but not from `other`, oldest first. */
function only(graph: LabGraph, tip: string, other: string): LabNode[] {
  const excluded = ancestors(graph, other)
  const included = ancestors(graph, tip)
  return graph.nodes
    .filter((candidate) => included.has(candidate.id) && !excluded.has(candidate.id))
    .sort((a, b) => ancestors(graph, a.id).size - ancestors(graph, b.id).size)
}

/** A branch's own commits: the ones `main` doesn't have. */
export function branchCommits(graph: LabGraph, branch: string): LabNode[] {
  return only(graph, graph.branches[branch], graph.branches.main)
}

function findConflict(mine: LabNode[], theirs: LabNode[]): LabConflict | undefined {
  for (const a of mine) {
    for (const b of theirs) {
      const touch = a.touches.find((tag) => b.touches.includes(tag))
      if (touch) return { touch, mine: a, theirs: b }
    }
  }
  return undefined
}

function resolveSnippet(conflict: LabConflict, resolution: Resolution): string {
  const mine = conflict.mine.snippet ?? conflict.mine.label
  const theirs = conflict.theirs.snippet ?? conflict.theirs.label
  if (resolution === 'mine') return mine
  if (resolution === 'theirs') return theirs
  return `${mine}\n${theirs}`
}

/** Drops commits no branch can reach any more (the originals after a rebase or squash). */
function prune(graph: LabGraph): LabGraph {
  const live = new Set<string>()
  for (const tip of Object.values(graph.branches)) {
    ancestors(graph, tip).forEach((id) => live.add(id))
  }
  return { ...graph, nodes: graph.nodes.filter((candidate) => live.has(candidate.id)) }
}

function uniqueId(graph: LabGraph, base: string): string {
  let id = base
  while (graph.nodes.some((candidate) => candidate.id === id)) id = `${id}'`
  return id
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

interface Options {
  resolution?: Resolution
}

// ---------------------------------------------------------------- operations

/** Replays `branch`'s own commits on top of `onto`, as new copies. */
export function rebase(
  graph: LabGraph,
  branch: string,
  onto: string,
  options: Options = {}
): LabResult {
  if (branch === 'main') return invalid('Rebase a branch onto main, not main itself.')
  const tip = graph.branches[branch]
  if (ancestors(graph, tip).has(onto)) {
    return invalid(`${branch} already starts from there.`)
  }
  const moving = only(graph, tip, onto)
  const conflict = findConflict(moving, only(graph, onto, tip))
  if (conflict && !options.resolution) return { ok: false, kind: 'conflict', conflict }

  let working: LabGraph = { ...graph, nodes: [...graph.nodes] }
  let parent = onto
  for (const original of moving) {
    const copy: LabNode = {
      ...original,
      id: uniqueId(working, `${original.id}'`),
      parents: [parent],
      copyOf: original.copyOf ?? original.id,
      snippet:
        conflict && options.resolution && original.id === conflict.mine.id
          ? resolveSnippet(conflict, options.resolution)
          : original.snippet,
    }
    working = { ...working, nodes: [...working.nodes, copy] }
    parent = copy.id
  }
  working = prune({ ...working, branches: { ...working.branches, [branch]: parent } })
  return {
    ok: true,
    graph: working,
    caption: CAPTIONS.rebase,
    announcement: `${plural(moving.length, 'commit')} on ${branch} now start from “${node(graph, onto).label}”.`,
    resolved:
      conflict && options.resolution ? resolveSnippet(conflict, options.resolution) : undefined,
  }
}

/** Joins `from` into `into` with a new commit that has both as parents. */
export function merge(
  graph: LabGraph,
  from: string,
  into: string,
  options: Options & { author?: string } = {}
): LabResult {
  if (from === into) return invalid('Pick two different branches to merge.')
  const fromTip = graph.branches[from]
  const intoTip = graph.branches[into]
  if (ancestors(graph, intoTip).has(fromTip)) {
    return invalid(`${into} already has everything on ${from}.`)
  }

  const conflict = findConflict(only(graph, fromTip, intoTip), only(graph, intoTip, fromTip))
  if (conflict && !options.resolution) return { ok: false, kind: 'conflict', conflict }

  const resolved =
    conflict && options.resolution ? resolveSnippet(conflict, options.resolution) : undefined
  const joined: LabNode = {
    id: uniqueId(graph, `merge-${from}`),
    label: `Merge ${from} into ${into}`,
    author: options.author ?? 'You',
    lane: into,
    parents: [intoTip, fromTip],
    touches: conflict ? [conflict.touch] : [],
    snippet: resolved,
  }
  return {
    ok: true,
    graph: {
      ...graph,
      nodes: [...graph.nodes, joined],
      branches: { ...graph.branches, [into]: joined.id },
    },
    caption: CAPTIONS.merge,
    announcement: `${into} now has a merge commit joining ${from}.`,
    resolved,
  }
}

/**
 * Collapses a run of commits on one branch, each the parent of the next, into a single commit.
 * The message is `label`, or the old messages joined.
 */
export function squash(
  graph: LabGraph,
  ids: string[],
  options: { label?: string } = {}
): LabResult {
  if (ids.length < 2) return invalid('Pick at least two commits to squash.')
  const picked = ids.map((id) => node(graph, id))
  const ordered = [...picked].sort(
    (a, b) => ancestors(graph, a.id).size - ancestors(graph, b.id).size
  )
  const lane = ordered[0].lane
  if (ordered.some((candidate) => candidate.lane !== lane)) {
    return invalid('Squash commits from the same branch.')
  }
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].parents.length !== 1 || ordered[i].parents[0] !== ordered[i - 1].id) {
      return invalid('Squash commits that sit next to each other.')
    }
  }

  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const labels = ordered.map((candidate) => candidate.label)
  const squashed: LabNode = {
    id: uniqueId(graph, `squash-${first.id}`),
    label: options.label ?? labels.join(' + '),
    author: first.author,
    lane,
    parents: first.parents,
    touches: [...new Set(ordered.flatMap((candidate) => candidate.touches))],
    snippet: [...ordered].reverse().find((candidate) => candidate.snippet)?.snippet,
    squashed: labels,
  }
  const replaced = new Set(ids)
  const nodes = graph.nodes
    .filter((candidate) => !replaced.has(candidate.id))
    .map((candidate) => ({
      ...candidate,
      parents: candidate.parents.map((parent) => (parent === last.id ? squashed.id : parent)),
    }))
  const branches = Object.fromEntries(
    Object.entries(graph.branches).map(([name, tip]) => [name, tip === last.id ? squashed.id : tip])
  )
  return {
    ok: true,
    graph: { ...graph, nodes: [...nodes, squashed], branches },
    caption: CAPTIONS.squash,
    announcement: `${plural(ordered.length, 'commit')} on ${lane} are now 1.`,
  }
}

/** Copies one commit onto the tip of `onto`, leaving its own branch as it was. */
export function cherryPick(
  graph: LabGraph,
  id: string,
  onto: string,
  options: Options = {}
): LabResult {
  const picked = node(graph, id)
  const ontoTip = graph.branches[onto]
  if (ancestors(graph, ontoTip).has(id)) return invalid(`${onto} already has that commit.`)
  if (picked.parents.length > 1) return invalid('Pick a regular commit, not a merge.')

  const since = picked.parents[0] ? only(graph, ontoTip, picked.parents[0]) : []
  const conflict = findConflict([picked], since)
  if (conflict && !options.resolution) return { ok: false, kind: 'conflict', conflict }

  const resolved =
    conflict && options.resolution ? resolveSnippet(conflict, options.resolution) : undefined
  const copy: LabNode = {
    ...picked,
    id: uniqueId(graph, `${id}'`),
    lane: onto,
    parents: [ontoTip],
    copyOf: picked.copyOf ?? picked.id,
    snippet: resolved ?? picked.snippet,
  }
  return {
    ok: true,
    graph: {
      ...graph,
      nodes: [...graph.nodes, copy],
      branches: { ...graph.branches, [onto]: copy.id },
    },
    caption: CAPTIONS.cherryPick,
    announcement: `A copy of “${picked.label}” is now on ${onto}. ${picked.lane} is unchanged.`,
    resolved,
  }
}

function invalid(reason: string): LabResult {
  return { ok: false, kind: 'invalid', reason }
}

// ---------------------------------------------------------------- comparing

/**
 * The shape of a graph, ignoring ids and labels: for each branch, the lanes of the commits along
 * its first-parent line and which of them are merges. Guided mode is done when shapes match.
 */
export function shapeOf(graph: LabGraph): string {
  return Object.keys(graph.branches)
    .sort()
    .map((branch) => {
      const steps: string[] = []
      let id: string | undefined = graph.branches[branch]
      while (id) {
        const current = node(graph, id)
        steps.push(`${current.lane}${current.parents.length > 1 ? '*' : ''}`)
        id = current.parents[0]
      }
      return `${branch}: ${steps.join(' < ')}`
    })
    .join('\n')
}
