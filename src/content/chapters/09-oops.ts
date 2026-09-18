import { isAncestor } from '../../engine/git/repo'
import type { GameState } from '../../engine/game'
import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { addedLines, local, ran, staged, tried, withClone } from './helpers'

const WELCOME = 'docs/welcome.md'
const NOTES = 'notes.txt'

/** Does the file on disk still differ from what's staged? */
function edited(state: GameState, path: string): boolean {
  const repo = local(state)
  return Boolean(repo && repo.working[path] !== repo.index[path])
}

/** The commit at the tip of the current branch, if it isn't `main`'s. */
function myCommit(state: GameState) {
  const repo = local(state)
  if (!repo || repo.head === 'main') return undefined
  const tip = repo.branches[repo.head]
  return isAncestor(repo.commits, tip, repo.branches.main) ? undefined : repo.commits[tip]
}

export const oopsChapter: Chapter = {
  id: '09-oops',
  title: 'Oops: undoing things',
  milestone: 'bonus',
  intro:
    '“I think I broke something” is the most common worry with Git. So let’s break things on purpose, and undo each one: an edit you regret, a file you staged by mistake, and a commit message you’d like back.',
  setup: (state) => {
    const withRepo = withClone(state)
    const repo = withRepo.git.local!
    const name = state.git.config.userName ?? state.player.name ?? 'You'
    return {
      ...withRepo,
      git: {
        ...withRepo.git,
        // Private scratch notes: nothing anyone else should see, sitting in the repo folder.
        local: {
          ...repo,
          working: {
            ...repo.working,
            [NOTES]: repo.working[NOTES] ?? 'Ask Jordan where the good coffee is.\n',
          },
        },
        config: {
          ...withRepo.git.config,
          userName: name,
          userEmail: withRepo.git.config.userEmail ?? 'you@inkwell.example',
        },
      },
      ui: { ...withRepo.ui, unlockedTabs: ['flack', 'gitnub', 'editor'] },
    }
  },
  steps: [
    {
      id: 'branch',
      title: 'Start a branch',
      body: 'Practice goes on a branch too: `git switch -c {{player.slug}}-oops`.',
      hints: ['Type `git switch -c {{player.slug}}-oops` and press Enter.'],
      solution: 'git switch -c {{player.slug}}-oops',
      goal: (state, event) => ran(event, 'git', 'switch') && local(state)?.head !== 'main',
      onEnter: [
        {
          type: 'flackMessage',
          channel: 'dm-robin',
          from: 'robin',
          text: 'Bonus round! Everyone’s first worry is breaking something. Here’s the secret: until you push, almost everything is undoable, and it’s all on your computer. Let’s make some mistakes on purpose. 🧪',
        },
      ],
    },
    {
      id: 'mess',
      title: 'Make a mess, and save it',
      body: `Open \`${WELCOME}\`, type any nonsense you like into it, and save.`,
      hints: [
        `Run \`open ${WELCOME}\`, or pick it in the Editor.`,
        'Type anything at all, then save with Ctrl+S (⌘S on a Mac).',
      ],
      editableFiles: [WELCOME],
      goal: (state, event) =>
        event.type === 'fileSaved' && event.path === WELCOME && edited(state, WELCOME),
    },
    {
      id: 'restore',
      title: 'Throw it away with git restore',
      body: `Changed your mind? \`git restore ${WELCOME}\` puts the file back how it was at the last commit.`,
      hints: [
        `Type \`git restore ${WELCOME}\` and press Enter.`,
        'Use the whole path, starting with `docs/`.',
      ],
      solution: `git restore ${WELCOME}`,
      goal: (state, event) => ran(event, 'git', 'restore') && !edited(state, WELCOME),
      afterNote:
        'Gone, as if you’d never typed it. This is the one undo that can’t itself be undone: Git never saw those edits, so it can’t bring them back. Use it on changes you’re sure you don’t want.',
      docs: [DOCS.gitRestore],
    },
    {
      id: 'real-change',
      title: 'Now make a change you want',
      body: `Open \`${WELCOME}\` again and add a line at the end welcoming the next new starter. Save.`,
      hints: [
        `Run \`open ${WELCOME}\`, go to the end, and type a new line.`,
        'Save with Ctrl+S (⌘S on a Mac).',
      ],
      editableFiles: [WELCOME],
      goal: (state, event) =>
        event.type === 'fileSaved' &&
        event.path === WELCOME &&
        addedLines(state, WELCOME).length > 0,
    },
    {
      id: 'add-all',
      title: 'Stage everything with git add .',
      body: 'Stage it the quick way, with `git add .` — “everything that changed, in this folder and below”.',
      hints: ['Type `git add .` and press Enter.', 'The dot means “this folder”.'],
      solution: 'git add .',
      goal: (state, event) => ran(event, 'git', 'add') && staged(state, NOTES),
      afterNote: `Oops: \`git status\` would show \`${NOTES}\` staged too — your private scratch notes. \`git add .\` takes *everything*, including files you forgot were there.`,
      reactions: [
        {
          id: 'careful-add',
          when: (state, event) =>
            ran(event, 'git', 'add') && staged(state, WELCOME) && !staged(state, NOTES),
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Very careful — staging just the file you meant is a great habit! For this exercise, run `git add .` anyway, so we can practise un-staging something.',
            },
          ],
        },
      ],
    },
    {
      id: 'unstage',
      title: `Unstage ${NOTES}`,
      body: `\`git restore --staged ${NOTES}\` takes it back out of the next commit. The file itself stays exactly as it is.`,
      hints: [
        `Type \`git restore --staged ${NOTES}\` and press Enter.`,
        'Without `--staged`, `git restore` changes the file instead. With it, only the staging.',
      ],
      solution: `git restore --staged ${NOTES}`,
      goal: (state, event) =>
        ran(event, 'git', 'restore') && !staged(state, NOTES) && staged(state, WELCOME),
      afterNote: `Your welcome line is still staged, and \`${NOTES}\` is back to being just a file on your computer. Nothing was lost.`,
      docs: [DOCS.gitRestore],
      reactions: [
        {
          id: 'unstaged-both',
          when: (state, event) =>
            tried(event, 'git', 'restore') && !staged(state, WELCOME) && !staged(state, NOTES),
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: `That unstaged your welcome line too — no harm done, it’s still in the file. \`git add ${WELCOME}\` puts it back.`,
            },
          ],
        },
      ],
    },
    {
      id: 'commit',
      title: 'Commit, with a lazy message',
      body: 'Commit it, but with the kind of message everyone writes in a hurry: `git commit -m "wip"`.',
      hints: ['Type `git commit -m "wip"` and press Enter.'],
      solution: 'git commit -m "wip"',
      goal: (state, event) => ran(event, 'git', 'commit') && Boolean(myCommit(state)),
    },
    {
      id: 'amend',
      title: 'Fix the message with --amend',
      body: '“wip” won’t mean much to anyone next week. You haven’t pushed yet, so rewrite it: `git commit --amend -m "Welcome the next new starter"`.',
      hints: [
        'Type `git commit --amend -m "Welcome the next new starter"`.',
        '`--amend` replaces your last commit instead of adding another one.',
      ],
      solution: 'git commit --amend -m "Welcome the next new starter"',
      goal: (state, event) => {
        const mine = myCommit(state)
        return (
          ran(event, 'git', 'commit') &&
          event.type === 'command' &&
          event.argv.includes('--amend') &&
          Boolean(mine && mine.message.trim().toLowerCase() !== 'wip')
        )
      },
      afterNote:
        'One commit, better message. **The rule:** amend only what you haven’t pushed. Once a commit is on GitNub, other people may have it, so fix it with a new commit instead.',
      docs: [DOCS.gitCommit],
    },
  ],
  mentorQuestions: ['undo-my-edit', 'amend-after-push', 'i-broke-it'],
  summary: [
    '`git restore <file>` throws away changes you haven’t staged. Git can’t bring them back.',
    '`git restore --staged <file>` unstages a file; the file itself doesn’t change.',
    '`git commit --amend -m "…"` rewrites your last commit — only before you push.',
  ],
}
