import { createRemote } from '../engine/git/repo'
import type { RemoteRepo } from '../engine/git/types'
import { characters } from './characters'

/** Monday 14 September 2026, 09:00 UTC: the learner's first day. */
export const WORLD_START = Date.UTC(2026, 8, 14, 9, 0, 0) / 1000

const person = (id: keyof typeof characters) => ({
  name: characters[id].name,
  email: characters[id].email,
})

export function createRemotes(): Record<string, RemoteRepo> {
  const docsSite = createRemote({
    slug: 'inkwell/docs-site',
    description: 'Inkwell product documentation',
    history: [
      {
        message: 'Start the docs site',
        author: person('jordan'),
        timestamp: WORLD_START - 86400 * 30,
        tree: { 'README.md': '# Inkwell Docs\n' },
      },
    ],
  })
  return { [docsSite.slug]: docsSite }
}
