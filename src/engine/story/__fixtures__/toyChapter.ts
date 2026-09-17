import { docsSite, T0 } from '../../git/__fixtures__/docsSite'
import { clone } from '../../git/repo'
import { line } from '../../lines'
import { createRegistry, registerCommand } from '../../shell/registry'
import type { GameState } from '../../game'
import type { Chapter, GameConfig } from '../types'

/**
 * A tiny game used to test the engine: say hello, optionally peek at a file, save team.md,
 * then wait for Sam to reply. A second chapter exists so chapter transitions can be tested.
 */
function registry() {
  const r = createRegistry<GameState>()
  registerCommand(r, {
    name: 'echo',
    run: ({ argv }) => ({ output: [line(argv.slice(1).join(' '))] }),
  })
  registerCommand(r, { name: 'hint', run: () => ({ effects: [{ type: 'showHint' }] }) })
  registerCommand(r, {
    name: 'rewrite',
    // Stands in for `git pull`: replaces a saved file.
    run: ({ state, argv }) => ({
      state: {
        ...state,
        git: {
          ...state.git,
          local: {
            ...state.git.local!,
            working: { ...state.git.local!.working, [argv[1]]: 'rewritten\n' },
          },
        },
      },
    }),
  })
  registerCommand(r, {
    name: 'fail',
    run: () => ({ ok: false, output: [line('nope', 'error')] }),
  })
  return r
}

export const toyChapter: Chapter = {
  id: 'toy',
  title: 'A toy chapter',
  milestone: 'day-one',
  intro: 'Hello {{player.name}}',
  setup: (state) => ({
    ...state,
    git: { ...state.git, local: state.git.local ?? clone(state.git.remotes['inkwell/docs-site']) },
    ui: { ...state.ui, unlockedTabs: ['flack', 'editor'] },
  }),
  steps: [
    {
      id: 'say-hello',
      title: 'Say hello',
      body: 'Type `echo hello`.',
      hints: ['Use echo.', 'Type: echo hello'],
      solution: 'echo hello',
      editableFiles: ['team.md'],
      goal: (_state, event) =>
        event.type === 'command' && event.name === 'echo' && event.argv[1] === 'hello',
      onEnter: [
        { type: 'flackMessage', id: 'welcome', channel: 'docs-team', from: 'jordan', text: 'Hi!' },
      ],
    },
    {
      id: 'peek',
      title: 'Peek at team.md',
      body: 'Optional.',
      optional: true,
      hints: [],
      goal: (_state, event) => event.type === 'fileOpened' && event.path === 'team.md',
    },
    {
      id: 'save',
      title: 'Save team.md',
      body: 'Add your name.',
      hints: ['Open the editor.'],
      goal: (_state, event) => event.type === 'fileSaved' && event.path === 'team.md',
      apply: (state) => ({ ...state, player: { name: 'Ada Lovelace' } }),
      onComplete: [
        {
          type: 'flackMessage',
          id: 'sam-hi',
          channel: 'docs-team',
          from: 'sam',
          text: 'Nice, {{player.name}}!',
          quickReplies: [{ id: 'wave', text: '👋' }],
          delayMs: 3000,
        },
      ],
    },
    {
      id: 'reply',
      title: 'Reply to Sam',
      body: 'Say hi back.',
      hints: [],
      goal: (_state, event) => event.type === 'flackReply' && event.messageId === 'sam-hi',
    },
  ],
  mentorQuestions: ['what-is-git'],
  summary: ['You said hello.'],
}

export const toyEpilogue: Chapter = {
  id: 'epilogue',
  title: 'Epilogue',
  milestone: 'day-one',
  intro: '',
  setup: (state) => state,
  steps: [
    {
      id: 'already-done',
      title: 'Be on the Flack tab',
      body: '',
      hints: [],
      // Satisfied by state, so it completes as soon as it's entered.
      goal: (state) => state.ui.activeTab === 'flack',
    },
    {
      id: 'wave',
      title: 'Wave',
      body: '',
      hints: [],
      goal: (_state, event) => event.type === 'command' && event.name === 'echo',
    },
  ],
  mentorQuestions: [],
  summary: [],
}

export function toyConfig(): GameConfig {
  return {
    chapters: [toyChapter, toyEpilogue],
    registry: registry(),
    startTime: T0,
    createRemotes: () => {
      const remote = docsSite()
      return { [remote.slug]: remote }
    },
    characters: {
      jordan: {
        id: 'jordan',
        name: 'Jordan Lee',
        email: 'jordan@inkwell.example',
        initials: 'JL',
        role: 'Lead',
        color: '#74c',
      },
      sam: {
        id: 'sam',
        name: 'Sam Rivera',
        email: 'sam@inkwell.example',
        initials: 'SR',
        role: 'Writer',
        color: '#0a7',
      },
      robin: {
        id: 'robin',
        name: 'Robin Okafor',
        email: 'robin@inkwell.example',
        initials: 'RO',
        role: 'Mentor',
        color: '#a50',
      },
    },
    channels: [
      { id: 'docs-team', name: 'docs-team', kind: 'channel' },
      { id: 'dm-robin', name: 'Robin Okafor', kind: 'dm', characterId: 'robin' },
    ],
    mentor: {
      characterId: 'robin',
      channel: 'dm-robin',
      entries: { 'what-is-git': { question: 'What is Git?', answer: 'A time machine for files.' } },
    },
  }
}
