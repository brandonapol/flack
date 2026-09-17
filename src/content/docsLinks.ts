import type { DocsLink } from '../engine/story/types'

/**
 * Every external link in the game lives here, so there's one place to fix a moved page.
 * Git commands link to git-scm.com; GitNub features link to the GitHub docs for the real thing;
 * shell basics link to one beginner-friendly MDN page.
 */
export const DOCS = {
  // Getting started
  whatIsGit: {
    label: 'What is Git? (Pro Git book)',
    href: 'https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F',
  },
  firstTimeSetup: {
    label: 'First-time Git setup',
    href: 'https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup',
  },
  commandLine: {
    label: 'Command line crash course (MDN)',
    href: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Environment_setup/Command_line',
  },
  glossary: { label: 'Git glossary', href: 'https://git-scm.com/docs/gitglossary' },

  // Commands
  git: { label: 'git', href: 'https://git-scm.com/docs/git' },
  gitVersion: {
    label: 'git --version',
    href: 'https://git-scm.com/docs/git#Documentation/git.txt---version',
  },
  gitConfig: { label: 'git config', href: 'https://git-scm.com/docs/git-config' },
  gitClone: { label: 'git clone', href: 'https://git-scm.com/docs/git-clone' },
  gitStatus: { label: 'git status', href: 'https://git-scm.com/docs/git-status' },
  gitAdd: { label: 'git add', href: 'https://git-scm.com/docs/git-add' },
  gitRestore: { label: 'git restore', href: 'https://git-scm.com/docs/git-restore' },
  gitDiff: { label: 'git diff', href: 'https://git-scm.com/docs/git-diff' },
  gitCommit: { label: 'git commit', href: 'https://git-scm.com/docs/git-commit' },
  gitLog: { label: 'git log', href: 'https://git-scm.com/docs/git-log' },
  gitShow: { label: 'git show', href: 'https://git-scm.com/docs/git-show' },
  gitRemote: { label: 'git remote', href: 'https://git-scm.com/docs/git-remote' },
  gitBranch: { label: 'git branch', href: 'https://git-scm.com/docs/git-branch' },
  gitSwitch: { label: 'git switch', href: 'https://git-scm.com/docs/git-switch' },
  gitPush: { label: 'git push', href: 'https://git-scm.com/docs/git-push' },
  gitFetch: { label: 'git fetch', href: 'https://git-scm.com/docs/git-fetch' },
  gitPull: { label: 'git pull', href: 'https://git-scm.com/docs/git-pull' },
  gitMerge: { label: 'git merge', href: 'https://git-scm.com/docs/git-merge' },
  gitRebase: { label: 'git rebase', href: 'https://git-scm.com/docs/git-rebase' },
  gitCherryPick: { label: 'git cherry-pick', href: 'https://git-scm.com/docs/git-cherry-pick' },

  // Concepts (Pro Git book)
  recordingChanges: {
    label: 'Recording changes to the repository',
    href: 'https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository',
  },
  remotes: {
    label: 'Working with remotes',
    href: 'https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes',
  },
  branching: {
    label: 'Basic branching and merging',
    href: 'https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging',
  },
  rebasing: { label: 'Rebasing', href: 'https://git-scm.com/book/en/v2/Git-Branching-Rebasing' },
  rewritingHistory: {
    label: 'Rewriting history (squashing)',
    href: 'https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History',
  },

  // Pull requests, as GitHub does them
  pullRequests: {
    label: 'About pull requests (GitHub)',
    href: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests',
  },
  squashMerge: {
    label: 'About pull request merges (GitHub)',
    href: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges',
  },
  updateBranch: {
    label: 'Keeping your pull request in sync (GitHub)',
    href: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/keeping-your-pull-request-in-sync-with-the-base-branch',
  },
  mergeConflicts: {
    label: 'About merge conflicts (GitHub)',
    href: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/about-merge-conflicts',
  },
} satisfies Record<string, DocsLink>

export type DocsKey = keyof typeof DOCS

export const ALLOWED_DOCS_HOSTS = ['git-scm.com', 'docs.github.com', 'developer.mozilla.org']
