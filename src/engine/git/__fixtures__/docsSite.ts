import { createRemote } from '../repo'
import type { GitConfig, Person } from '../types'

export const jordan: Person = { name: 'Jordan Lee', email: 'jordan@inkwell.example' }
export const sam: Person = { name: 'Sam Rivera', email: 'sam@inkwell.example' }
export const ada: GitConfig = { userName: 'Ada', userEmail: 'ada@inkwell.example' }

/** Mon Sep 14 2026 09:00:00 UTC */
export const T0 = Date.UTC(2026, 8, 14, 9, 0, 0) / 1000

export const TEAM_MD = `# Docs team

Add your name to the bottom of the list to say hi!

- Jordan Lee
- Robin Okafor
`

export function docsSite() {
  return createRemote({
    slug: 'inkwell/docs-site',
    description: 'Inkwell product documentation',
    history: [
      {
        message: 'Start the docs site',
        author: jordan,
        timestamp: T0,
        tree: { 'README.md': '# Inkwell Docs\n', 'docs/welcome.md': 'Welcome\n' },
      },
      {
        message: 'Add team list',
        author: jordan,
        timestamp: T0 + 60,
        tree: {
          'README.md': '# Inkwell Docs\n',
          'docs/welcome.md': 'Welcome\n',
          'team.md': TEAM_MD,
        },
      },
    ],
  })
}
