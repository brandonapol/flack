import { clone, isAncestor } from '../../engine/git/repo'
import type { Chapter, GameConfig } from '../../engine/story/types'
import type { GameState } from '../../engine/game'
import { DOCS } from '../docsLinks'
import { DOCS_SITE } from '../world'
import { docsSite, local, ran, staged, tried } from './helpers'

/** Has the current branch got a commit that `main` hasn't? */
function committedOnBranch(state: GameState): boolean {
  const repo = local(state)
  if (!repo || repo.head === 'main') return false
  const tip = repo.branches[repo.head]
  return tip !== repo.branches.main && !isAncestor(repo.commits, tip, repo.branches.main)
}

/** On `main`, and it's where GitNub's is. */
function caughtUp(state: GameState): boolean {
  const repo = local(state)
  return Boolean(
    repo && repo.head === 'main' && repo.branches.main === docsSite(state).branches.main
  )
}

/** Jumping straight here (`?chapter=03`): where Chapter 2 leaves off — cloned, name saved. */
function signedClone(state: GameState): GameState {
  const repo = clone(state.git.remotes[DOCS_SITE])
  const name = state.player.name ?? 'You'
  const team = repo.working['team.md']
  return {
    ...state,
    player: { ...state.player, name },
    git: {
      ...state.git,
      local: { ...repo, working: { ...repo.working, 'team.md': `${team}- ${name}\n` } },
    },
    shell: { ...state.shell, cwd: `/Users/you/${repo.dir}` },
  }
}

export const pullRequestChapter: Chapter = {
  id: '03-pull-request',
  title: 'Save it to GitNub',
  milestone: 'day-one',
  intro:
    'Your name is saved on your computer. Now it needs to reach GitNub — the way everything does here: a branch, a commit, a merge request, and a squash merge.',
  setup: (state: GameState, config: GameConfig) => {
    void config
    return {
      ...(state.git.local ? state : signedClone(state)),
      ui: { ...state.ui, unlockedTabs: ['flack', 'gitnub', 'editor'] },
    }
  },
  steps: [
    {
      id: 'branch',
      title: 'Start a branch',
      body: 'Nobody at Inkwell changes `main` directly. Run `git switch -c {{player.slug}}-team-list` to start your own **branch**: your own line of work, named after what you’re doing.',
      hints: [
        'Type `git switch -c {{player.slug}}-team-list` and press Enter.',
        'The `-c` means “create it”. Branch names can’t have spaces — use dashes.',
      ],
      solution: 'git switch -c {{player.slug}}-team-list',
      goal: (state, event) => ran(event, 'git', 'switch') && local(state)?.head !== 'main',
      afterNote:
        'The prompt shows your branch now. Your edit came with you: branches share the same folder, so switching swaps what’s in it.',
      docs: [DOCS.gitSwitch, DOCS.branching],
      onEnter: [
        {
          type: 'flackMessage',
          id: 'jordan-branch',
          channel: 'docs-team',
          from: 'jordan',
          text: 'When you’re ready to share it: branch, commit, push, then create a merge request. I’ll review it as soon as it’s up. 👍',
        },
      ],
    },
    {
      id: 'add',
      title: 'Stage your change',
      body: 'Run `git add team.md`. That picks which changes go into your next save point — like putting things in a box before taping it shut.',
      hints: [
        'Type `git add team.md` and press Enter.',
        'You can also use `git add .` to include everything you’ve changed.',
      ],
      solution: 'git add team.md',
      goal: (state, event) => ran(event, 'git', 'add') && staged(state, 'team.md'),
      afterNote: 'Run `git status` again and the file is green now: staged, ready to be committed.',
      docs: [DOCS.gitAdd, DOCS.recordingChanges],
    },
    {
      id: 'commit',
      title: 'Commit it',
      body: 'Run `git commit -m "Add {{player.name}} to the team list"`. A **commit** is a save point in the history, with a message saying what it’s for.',
      hints: [
        'Type `git commit -m "Add {{player.name}} to the team list"` and press Enter.',
        'The message goes in quotes, after `-m`.',
      ],
      solution: 'git commit -m "Add {{player.name}} to the team list"',
      goal: (state, event) => ran(event, 'git', 'commit') && committedOnBranch(state),
      afterNote:
        'That commit lives on your branch, on your computer. `git log --oneline` lists it if you want to look.',
      docs: [DOCS.gitCommit],
      reactions: [
        {
          id: 'identity',
          when: (state, event) => tried(event, 'git', 'commit') && !state.git.config.userName,
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Ah, the classic first-commit greeting! 😄 Git doesn’t know who you are yet. Run these two once and it’ll never ask again:\n\n`git config --global user.name "{{player.name}}"`\n\n`git config --global user.email "{{player.email}}"`\n\nThen run your commit again.',
            },
            { type: 'openTab', tab: 'flack', delayMs: 300 },
          ],
        },
      ],
    },
    {
      id: 'push',
      title: 'Push your branch to GitNub',
      body: 'Run `git push -u origin {{player.slug}}-team-list`. That sends your branch to GitNub. The `-u` links the two, so next time `git push` is enough.',
      hints: [
        'Type `git push -u origin {{player.slug}}-team-list` and press Enter.',
        '`origin` is Git’s nickname for GitNub, the place you cloned from.',
      ],
      solution: 'git push -u origin {{player.slug}}-team-list',
      goal: (_state, event) => event.type === 'branchPushed',
      afterNote:
        'Notice what GitNub said back: it’s offering you a merge request. That’s the next step, and it happens on the website.',
      docs: [DOCS.gitPush],
    },
    {
      id: 'open-pr',
      title: 'Create a merge request',
      body: 'On the **GitNub** tab, click **Create merge request** in the banner, then **Create merge request** again at the bottom of the form. A merge request (MR) says: *here’s my branch, please take a look*.',
      hints: [
        'Switch to the GitNub tab — there’s a blue banner about your branch.',
        'Click **Create merge request** in the banner, then **Create merge request** on the form.',
      ],
      goal: (_state, event) => event.type === 'pullRequestOpened',
      afterNote: 'Jordan gets a notification. Reviews are usually quick here.',
      docs: [DOCS.pullRequests],
      onComplete: [
        {
          type: 'reviewPullRequest',
          slug: DOCS_SITE,
          // The learner's, whatever its number: an earlier experiment may have taken !4.
          number: 'latest',
          author: 'jordan',
          body: 'Looks great — welcome aboard! Merge whenever you’re ready. 🎉',
          approve: true,
          delayMs: 5000,
        },
        {
          type: 'flackMessage',
          channel: 'docs-team',
          from: 'jordan',
          text: 'Approved your merge request — go ahead and merge it. 🎉',
          delayMs: 5200,
        },
      ],
    },
    {
      id: 'merge',
      title: 'Merge it',
      body: 'On the merge request, click **Merge**. **Squash commits** is always on here, so your commits become **one** tidy commit on `main` — that’s why our history reads like a list of finished changes.',
      hints: [
        'The blue **Merge** button is at the bottom of the merge request.',
        'Leave **Delete source branch** ticked, and click **Merge**.',
      ],
      goal: (_state, event) => event.type === 'pullRequestMerged',
      afterNote: 'Your name is on `main` now, and the whole team can see it.',
      docs: [DOCS.squashMerge],
    },
    {
      id: 'delete-branch',
      title: 'Delete the source branch (optional)',
      body: 'With **Delete source branch** ticked, merging already did this. If you unticked it, click **Delete source branch** now. It’s safe: your work is on `main`, as its own commit.',
      optional: true,
      hints: [
        'The **Delete source branch** button appears right after merging, if the branch is still there.',
      ],
      goal: (_state, event) => event.type === 'remoteBranchDeleted',
    },
    {
      id: 'switch-main',
      title: 'Go back to main',
      body: 'In the terminal, run `git switch main`. Your branch did its job; from now on you start new work from `main`.',
      hints: ['Type `git switch main` and press Enter.'],
      solution: 'git switch main',
      goal: (state, event) => ran(event, 'git', 'switch') && local(state)?.head === 'main',
    },
    {
      id: 'pull',
      title: 'Catch up with git pull',
      body: 'Your copy of `main` doesn’t have the merge yet. Run `git pull` to bring it down.',
      hints: ['Type `git pull` and press Enter.'],
      solution: 'git pull',
      // The lesson is `git pull`, so only a pull counts, not any other way of catching up.
      goal: (state, event) => ran(event, 'git', 'pull') && caughtUp(state),
      reactions: [
        {
          id: 'caught-up-another-way',
          when: (state, event) =>
            event.type === 'command' && !ran(event, 'git', 'pull') && caughtUp(state),
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'That caught you up too! `git pull` does it in one go, and it’s the one you’ll use every day. Run `git pull` now; it’ll say you’re already up to date.',
            },
          ],
        },
      ],
      afterNote:
        'Your copy and GitNub’s match again. Branch → commit → push → merge request → squash merge → pull: that’s the loop, and you’ve done it once now.',
      docs: [DOCS.gitPull],
    },
  ],
  mentorQuestions: ['what-is-a-branch', 'what-is-an-mr', 'what-is-squash-merge', 'delete-branch'],
  summary: [
    '`git switch -c <name>` starts a branch; `git add` stages; `git commit -m "…"` saves a commit.',
    '`git push -u origin <branch>` puts the branch on GitNub, where you create a merge request.',
    '**Merge** (with **Squash commits**) turns the branch into one commit on `main`; `git pull` brings it back to you.',
  ],
}
