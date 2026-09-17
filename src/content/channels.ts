import type { Channel } from '../engine/story/types'

export const CHANNELS: Channel[] = [
  { id: 'general', name: 'general', kind: 'channel', topic: 'Company-wide news and hellos' },
  {
    id: 'docs-team',
    name: 'docs-team',
    kind: 'channel',
    topic: 'The docs team: questions, reviews, wins',
  },
  { id: 'dm-robin', name: 'Robin Okafor', kind: 'dm', characterId: 'robin' },
]

export const DEFAULT_CHANNEL = 'docs-team'
export const MENTOR_CHANNEL = 'dm-robin'
