import type { LabScenario } from '../engine/story/types'

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

export const LAB_SCENARIOS: Record<string, LabScenario> = { sandbox }
