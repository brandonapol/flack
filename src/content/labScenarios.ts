import { merge, rebase, squash, type LabGraph, type LabResult } from '../engine/lab/graph'
import type { LabFigure, LabScenario } from '../engine/story/types'

/** The graph an operation produces; content only ever asks for ones that work. */
function after(result: LabResult): LabGraph {
  if (!result.ok) throw new Error(result.kind === 'invalid' ? result.reason : 'unexpected conflict')
  return result.graph
}

/**
 * The free sandbox: your branch and Sam's both started from the style guide; main has moved on
 * since. Your tip and Sam's both go in the tips list, so combining those two conflicts.
 */
const sandbox: LabScenario = {
  id: 'sandbox',
  title: 'Play with a commit graph',
  intro:
    'Each circle is a commit; each row is a branch, with `main` at the bottom. Try rebasing **yours** onto the newest commit on main, squashing your three commits into one, merging Sam’s branch, or cherry-picking just one commit.',
  start: {
    lanes: ['main', 'yours', 'sam'],
    branches: { main: 'm3', yours: 'y3', sam: 's1' },
    nodes: [
      {
        id: 'm1',
        label: 'Start the docs site',
        author: 'JL',
        lane: 'main',
        parents: [],
        touches: [],
      },
      {
        id: 'm2',
        label: 'Add the style guide',
        author: 'RO',
        lane: 'main',
        parents: ['m1'],
        touches: ['style guide'],
      },
      {
        id: 'm3',
        label: 'Fix a typo',
        author: 'AC',
        lane: 'main',
        parents: ['m2'],
        touches: ['welcome page'],
      },
      {
        id: 'y1',
        label: 'Draft the intro',
        author: 'You',
        lane: 'yours',
        parents: ['m2'],
        touches: ['intro'],
      },
      { id: 'y2', label: 'wip', author: 'You', lane: 'yours', parents: ['y1'], touches: ['intro'] },
      {
        id: 'y3',
        label: 'Add a tip about links',
        author: 'You',
        lane: 'yours',
        parents: ['y2'],
        touches: ['tips'],
        snippet: '- Link to the page, not the heading.',
      },
      {
        id: 's1',
        label: 'Add a tip about headings',
        author: 'SR',
        lane: 'sam',
        parents: ['m2'],
        touches: ['tips'],
        snippet: '- Use sentence case for headings.',
      },
    ],
  },
}

/** Chapter 6: your pull request after Alex's merged first. Rebasing it is what Update branch does. */
const outOfDate: LabScenario = {
  id: 'out-of-date',
  title: 'What “out of date” looks like',
  intro:
    'This is your pull request right now: your fix started from the style guide, and Alex’s tips landed on `main` after. Drag **your commit** onto **Alex’s** and choose **Rebase onto here** — that’s exactly what **Update branch** does.',
  start: {
    lanes: ['main', 'yours'],
    branches: { main: 'm3', yours: 'y1' },
    nodes: [
      {
        id: 'm1',
        label: 'Start the docs site',
        author: 'JL',
        lane: 'main',
        parents: [],
        touches: [],
      },
      {
        id: 'm2',
        label: 'Add the style guide',
        author: 'RO',
        lane: 'main',
        parents: ['m1'],
        touches: ['style guide'],
      },
      {
        id: 'm3',
        label: 'Add two team tips',
        author: 'AC',
        lane: 'main',
        parents: ['m2'],
        touches: ['team tips'],
      },
      {
        id: 'y1',
        label: 'Fix a typo in the style guide',
        author: 'You',
        lane: 'yours',
        parents: ['m2'],
        touches: ['formatting'],
      },
    ],
  },
}

const MAIN_SO_FAR: LabGraph['nodes'] = [
  { id: 'm1', label: 'Start the docs site', author: 'JL', lane: 'main', parents: [], touches: [] },
  {
    id: 'm2',
    label: 'Add the style guide',
    author: 'RO',
    lane: 'main',
    parents: ['m1'],
    touches: ['style guide'],
  },
]

const SQUASHED_LABEL = 'Reword the formatting tips'

/** Chapter 7, challenge A: four small commits → one. */
const messyStart: LabGraph = {
  lanes: ['main', 'yours'],
  branches: { main: 'm2', yours: 'w4' },
  nodes: [
    ...MAIN_SO_FAR,
    ...['wip', 'fix typo', 'actually fix typo', 'final'].map((label, index) => ({
      id: `w${index + 1}`,
      label,
      author: 'You',
      lane: 'yours',
      parents: [index === 0 ? 'm2' : `w${index}`],
      touches: ['formatting'],
    })),
  ],
}

const tidySquash: LabScenario = {
  id: 'tidy-squash',
  title: 'Four commits, one change',
  intro:
    'Your branch has four small commits for what’s really one change. **Squash** them into one: drag `wip` onto `final` (or select one, then the other) and choose **Squash into here**.',
  start: messyStart,
  target: after(squash(messyStart, ['w1', 'w2', 'w3', 'w4'], { label: SQUASHED_LABEL })),
  squashLabel: SQUASHED_LABEL,
  hints: {
    rebase: 'That moved them, but there are still four. Undo, then squash them into one.',
    merge:
      'That joined your branch into main — not what we’re after yet. Undo, and squash the four into one.',
    cherryPick: 'That copied one commit. Undo, and squash all four into one instead.',
  },
}

/** Chapter 7, challenge B: main moved on; put your commit on top. */
const behindStart: LabGraph = {
  lanes: ['main', 'yours'],
  branches: { main: 'm3', yours: 'y1' },
  nodes: [
    ...MAIN_SO_FAR,
    {
      id: 'm3',
      label: 'Add two team tips',
      author: 'AC',
      lane: 'main',
      parents: ['m2'],
      touches: ['team tips'],
    },
    {
      id: 'y1',
      label: SQUASHED_LABEL,
      author: 'You',
      lane: 'yours',
      parents: ['m2'],
      touches: ['formatting'],
    },
  ],
}

const tidyRebase: LabScenario = {
  id: 'tidy-rebase',
  title: 'One straight line',
  intro:
    'Alex merged again while you were tidying. Make history **one straight line**: your commit should start from Alex’s, the newest on `main`. Drag yours onto Alex’s and pick what fits.',
  start: behindStart,
  target: after(rebase(behindStart, 'yours', 'm3')),
  hints: {
    merge:
      'That’s a merge: both histories kept, joined by a new commit. Perfectly valid — but here we want one straight line. Undo, then try **Rebase onto here**.',
    cherryPick:
      'That copied your commit onto main, but your branch still starts from the old spot. Undo, and try **Rebase onto here**.',
    rebase: 'One straight line. That’s exactly what **Update branch** did for you in Chapter 6.',
  },
}

/** Merge and rebase side by side, from the same starting point as challenge B. */
export const MERGE_VS_REBASE: LabFigure = {
  title: 'The same two branches, merged or rebased',
  panels: [
    {
      label: 'Merge',
      description:
        'Both histories stay as they were, and a new commit on main joins them. Nothing is rewritten.',
      graph: after(merge(behindStart, 'yours', 'main')),
    },
    {
      label: 'Rebase',
      description:
        'Your commit is replayed on top of Alex’s as a new copy, so history is one straight line.',
      graph: after(rebase(behindStart, 'yours', 'm3')),
    },
  ],
}

export const LAB_SCENARIOS: Record<string, LabScenario> = {
  sandbox,
  'out-of-date': outOfDate,
  'tidy-squash': tidySquash,
  'tidy-rebase': tidyRebase,
}
