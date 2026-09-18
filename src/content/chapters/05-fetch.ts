import { clone } from '../../engine/git/repo'
import { getStatus } from '../../engine/git/status'
import type { GameState } from '../../engine/game'
import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { DOCS_SITE, WELCOME_TYPO, mergedAs } from '../world'
import { docsSite, local, ran, tried } from './helpers'

/** Has the learner's `origin/main` caught up with GitNub? */
function fetched(state: GameState): boolean {
  return local(state)?.remoteBranches.main === docsSite(state).branches.main
}

/** Is local `main` where GitNub's is? */
function caughtUp(state: GameState): boolean {
  return local(state)?.branches.main === docsSite(state).branches.main
}

export const fetchChapter: Chapter = {
  id: '05-look-before-you-leap',
  title: 'Look before you leap',
  milestone: 'keeping-in-sync',
  intro:
    'Day two. Merge requests have been merging while you were away, so before you start anything new it’s worth checking what changed on GitNub — without changing your files yet.',
  setup: (state) => {
    const repo = state.git.local ?? clone(state.git.remotes[DOCS_SITE])
    return {
      ...state,
      git: { ...state.git, local: repo },
      shell: { ...state.shell, cwd: `/Users/you/${repo.dir}` },
      ui: { ...state.ui, unlockedTabs: ['flack', 'gitnub', 'editor'] },
    }
  },
  steps: [
    {
      id: 'fetch',
      title: 'Run git fetch',
      body: 'Alex just merged a fix on GitNub. Run `git fetch`: it asks GitNub what’s new and downloads it, **without touching your files**.',
      hints: [
        'Type `git fetch` and press Enter.',
        '`git status` can’t see GitNub by itself — fetch first, then ask for the status.',
      ],
      solution: 'git fetch',
      goal: (state, event) => ran(event, 'git', 'fetch') && fetched(state),
      afterNote:
        '`origin/main` just moved. It’s your computer’s **memory of GitNub**: what `main` looked like there the last time you checked. Your own `main` hasn’t moved.',
      docs: [DOCS.gitFetch],
      onEnter: [
        {
          type: 'remoteCommit',
          slug: DOCS_SITE,
          author: 'alex',
          message: mergedAs('Fix a typo on the welcome page', 6),
          edits: [
            {
              kind: 'replaceText',
              path: 'docs/welcome.md',
              search: WELCOME_TYPO,
              replace: 'documentation',
            },
          ],
        },
        {
          type: 'flackMessage',
          id: 'alex-typo',
          channel: 'docs-team',
          from: 'alex',
          text: 'Morning! Merged a tiny typo fix on the welcome page — “documentaion” 🙈',
          delayMs: 1500,
        },
      ],
      reactions: [
        {
          id: 'status-first',
          when: (state, event) => ran(event, 'git', 'status') && !fetched(state),
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Up to date? Not quite! 🙂 `git status` compares your branch with your computer’s *memory* of GitNub, and that memory is from yesterday. `git fetch` refreshes it — then ask again.',
            },
          ],
        },
      ],
    },
    {
      id: 'status',
      title: 'Ask git status again',
      body: 'Now run `git status`. With a fresh memory of GitNub, it can tell you how far behind you are.',
      hints: ['Type `git status` and press Enter.'],
      solution: 'git status',
      goal: (state, event) =>
        ran(event, 'git', 'status') && (getStatus(local(state)!).upstream?.behind ?? 0) > 0,
      afterNote:
        '*Behind by 1 commit, and can be fast-forwarded*: GitNub has one commit you don’t, and you haven’t got anything it hasn’t — so catching up is simple.',
      docs: [DOCS.gitStatus],
    },
    {
      id: 'log',
      title: 'See what’s new',
      body: 'Look before you leap: `git log --oneline origin/main` lists the commits on GitNub’s `main`, newest first. Alex’s fix is at the top.',
      hints: [
        'Type `git log --oneline origin/main` and press Enter.',
        'The `origin/` part matters: plain `git log` shows your `main`, which doesn’t have it yet.',
      ],
      solution: 'git log --oneline origin/main',
      goal: (_state, event) =>
        ran(event, 'git', 'log') && event.type === 'command' && event.argv.includes('origin/main'),
      afterNote:
        'You can read what changed before it lands in your files. Try `git show origin/main` sometime to see the change itself.',
      docs: [DOCS.gitLog],
    },
    {
      id: 'merge',
      title: 'Bring it into your main',
      body: 'Happy with it? Run `git merge origin/main` to move your `main` up to GitNub’s. Since you’re only behind, Git just slides your branch forward: a **fast-forward**.',
      hints: [
        'Type `git merge origin/main` and press Enter.',
        'Make sure you’re on `main` — the prompt shows the branch.',
      ],
      solution: 'git merge origin/main',
      goal: (state, event) =>
        (ran(event, 'git', 'merge') || ran(event, 'git', 'pull')) && caughtUp(state),
      afterNote:
        'That’s all `git pull` is: `git fetch` and then `git merge`, in one go. Splitting them lets you look first.',
      docs: [DOCS.gitMerge, DOCS.gitPull],
      onComplete: [
        {
          type: 'flackMessage',
          channel: 'docs-team',
          from: 'alex',
          text: 'Thanks for checking before you started, {{player.name}} — saves a lot of “why is my copy different?” later. 👀',
          delayMs: 1500,
        },
      ],
      reactions: [
        {
          id: 'merge-main',
          when: (_state, event) =>
            tried(event, 'git', 'merge') && event.type === 'command' && event.argv[2] === 'main',
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Close! `main` is *your* main, which you’re already on. GitNub’s is `origin/main` — merge that one.',
            },
          ],
        },
      ],
    },
    {
      id: 'look',
      title: 'Check the fix arrived',
      body: 'Open `docs/welcome.md` in the Editor. “documentaion” is spelled right now.',
      hints: ['Run `open docs/welcome.md`, or pick it in the Editor’s file list.'],
      solution: 'open docs/welcome.md',
      optional: true,
      goal: (_state, event) => event.type === 'fileOpened' && event.path === 'docs/welcome.md',
    },
  ],
  mentorQuestions: ['what-is-origin-main', 'fetch-vs-pull', 'what-is-a-rebase', 'i-broke-it'],
  summary: [
    '`git fetch` downloads what’s new on GitNub without touching your files.',
    '`origin/main` is your computer’s memory of GitNub; `git status` compares against it.',
    '`git merge origin/main` brings it into your branch. `git pull` is fetch + merge in one.',
  ],
}
