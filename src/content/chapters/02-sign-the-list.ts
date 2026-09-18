import { clone } from '../../engine/git/repo'
import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { DOCS_SITE } from '../world'
import { addedLines, keptExistingLines, nameFromBullet, ran } from './helpers'

/** "Your Name", typed (or pasted) as-is from an old hint or habit. */
const isPlaceholder = (name: string) => /^your name$/i.test(name.trim())

/** Exactly one new non-empty bullet, with everything that was there before still there. */
function signedTheList(state: Parameters<typeof addedLines>[0]): string | undefined {
  const added = addedLines(state, 'team.md')
  if (added.length !== 1 || !keptExistingLines(state, 'team.md')) return undefined
  const name = nameFromBullet(added[0])
  if (isPlaceholder(name)) return undefined
  return name.length > 0 && added[0].trim().startsWith('-') ? name : undefined
}

export const signTheListChapter: Chapter = {
  id: '02-sign-the-list',
  title: 'Sign the list',
  milestone: 'day-one',
  intro: 'Every new person adds their name to `team.md`. Today that’s you.',
  setup: (state, config) => {
    const withRepo = state.git.local
      ? state
      : {
          ...state,
          git: { ...state.git, local: clone(state.git.remotes[DOCS_SITE]) },
          shell: { ...state.shell, cwd: '/Users/you/docs-site' },
        }
    void config
    return {
      ...withRepo,
      ui: { ...withRepo.ui, unlockedTabs: ['flack', 'gitnub', 'editor'] },
    }
  },
  steps: [
    {
      id: 'open-team-md',
      title: 'Open team.md in the Editor',
      body: 'Run `open team.md` in the terminal, or click the **Editor** tab and pick the file.',
      hints: [
        'Type `open team.md` and press Enter.',
        'You can also click the Editor tab, then `team.md` in the list.',
      ],
      solution: 'open team.md',
      goal: (_state, event) => event.type === 'fileOpened' && event.path === 'team.md',
      onEnter: [
        {
          type: 'flackMessage',
          id: 'jordan-sign',
          channel: 'docs-team',
          from: 'jordan',
          text: 'Add yourself to `team.md` when you get a moment — bottom of the list, one line, exactly like the others.',
        },
        { type: 'unlockTab', tab: 'editor' },
      ],
    },
    {
      id: 'add-name',
      title: 'Add your name and save',
      body: 'Add one line at the bottom: a dash, a space, then your own name, like *- Ada Lovelace*. Then press **Save** (or Ctrl+S; ⌘S on a Mac). Saving changes the file on your computer — nobody else can see it yet.',
      hints: [
        'Click at the end of the last line, press Enter, and type `- ` followed by your name.',
        'Keep the other names: just add one line at the bottom, starting with `- `.',
      ],
      editableFiles: ['team.md'],
      goal: (state, event) =>
        event.type === 'fileSaved' && event.path === 'team.md' && Boolean(signedTheList(state)),
      apply: (state) => {
        const name = signedTheList(state)
        return name ? { ...state, player: { ...state.player, name } } : state
      },
      afterNote:
        'Saved — on your computer. Git hasn’t recorded anything yet, and GitNub knows nothing about it. That’s the next chapter.',
      reactions: [
        {
          id: 'placeholder-name',
          when: (state, event) => {
            if (event.type !== 'fileSaved' || event.path !== 'team.md') return false
            const added = addedLines(state, 'team.md')
            return added.length === 1 && isPlaceholder(nameFromBullet(added[0]))
          },
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Ha — “Your Name” is the placeholder! Put your own name there instead and save again. 🙂',
            },
          ],
        },
        {
          id: 'too-many-lines',
          when: (state, event) =>
            event.type === 'fileSaved' &&
            event.path === 'team.md' &&
            addedLines(state, 'team.md').length > 1,
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Saw your save — looks like more than one new line went in. One line, like `- Ada Lovelace`, keeps the list tidy. Nothing’s broken; just edit and save again.',
            },
          ],
        },
        {
          id: 'lost-lines',
          when: (state, event) =>
            event.type === 'fileSaved' &&
            event.path === 'team.md' &&
            !keptExistingLines(state, 'team.md'),
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Heads up: one of the existing names disappeared from `team.md`. Pop it back in and save again — and don’t worry, the original is safe in Git either way.',
            },
          ],
        },
      ],
    },
    {
      id: 'status',
      title: 'Ask Git what changed',
      body: 'Back in the terminal, run `git status`. Git compares your files with its last saved version and tells you what’s different.',
      hints: ['Type `git status` and press Enter.'],
      solution: 'git status',
      goal: (_state, event) => ran(event, 'git', 'status'),
      afterNote:
        '“Changes not staged for commit” means: Git can see your edit, but you haven’t told it to include it in your next save point.',
      docs: [DOCS.gitStatus],
    },
    {
      id: 'diff',
      title: 'See the exact change (optional)',
      body: 'Run `git diff` to see the lines you added, with a `+` in front of each one.',
      optional: true,
      hints: ['Type `git diff` and press Enter.'],
      solution: 'git diff',
      goal: (_state, event) => ran(event, 'git', 'diff'),
      docs: [DOCS.gitDiff],
    },
  ],
  mentorQuestions: ['save-vs-commit', 'add-vs-commit'],
  summary: [
    'Saving a file changes it on your computer only.',
    '`git status` says what’s changed; `git diff` shows the exact lines.',
  ],
}
