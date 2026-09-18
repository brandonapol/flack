import type { LabGraph } from '../graph'

/**
 * main: start → style guide → welcome typo
 * yours (from style guide): intro draft → wip → a tip about links
 * sam   (from style guide): a tip about headings
 * Your tip and Sam's tip both go in the tips list, so combining them conflicts.
 */
export function sandbox(): LabGraph {
  return {
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
        touches: ['style'],
      },
      {
        id: 'm3',
        label: 'Fix a typo',
        author: 'AC',
        lane: 'main',
        parents: ['m2'],
        touches: ['welcome'],
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
  }
}
