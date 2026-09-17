import type { Character } from '../engine/story/types'

export const characters: Record<string, Character> = {
  jordan: {
    id: 'jordan',
    name: 'Jordan Lee',
    email: 'jordan@inkwell.example',
    initials: 'JL',
    role: 'Docs team lead',
    color: '#7048e8',
  },
  robin: {
    id: 'robin',
    name: 'Robin Okafor',
    email: 'robin@inkwell.example',
    initials: 'RO',
    role: 'Senior technical writer',
    color: '#d9480f',
  },
  sam: {
    id: 'sam',
    name: 'Sam Rivera',
    email: 'sam@inkwell.example',
    initials: 'SR',
    role: 'Technical writer (also new today)',
    color: '#0c8599',
  },
  alex: {
    id: 'alex',
    name: 'Alex Chen',
    email: 'alex@inkwell.example',
    initials: 'AC',
    role: 'Software engineer',
    color: '#2f9e44',
  },
}
