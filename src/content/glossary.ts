import type { DocsKey } from './docsLinks'

export interface GlossaryEntry {
  id: string
  term: string
  /** Other spellings that should link to this entry, lower case. */
  aliases?: string[]
  /** Plain words, 30 words at most. */
  definition: string
  docs?: DocsKey
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'terminal',
    term: 'terminal',
    aliases: ['command line', 'shell'],
    definition:
      'A window where you type commands instead of clicking. You type, press Enter, and it prints a reply.',
    docs: 'commandLine',
  },
  {
    id: 'folder',
    term: 'folder',
    aliases: ['directory', 'folders', 'directories'],
    definition:
      'A container for files, same as in Finder or File Explorer. In the terminal, `cd` moves between folders and `ls` lists what’s inside.',
    docs: 'commandLine',
  },
  {
    id: 'repository',
    term: 'repository',
    aliases: ['repo', 'repositories', 'repos'],
    definition:
      'A project folder that Git keeps a full history for: every file, and every saved version of it.',
    docs: 'whatIsGit',
  },
  {
    id: 'clone',
    term: 'clone',
    aliases: ['cloning', 'cloned'],
    definition: 'Download a copy of a repository, with its whole history, onto your computer.',
    docs: 'gitClone',
  },
  {
    id: 'remote',
    term: 'remote',
    definition:
      'A copy of the repository that lives somewhere else, like GitNub. Your computer talks to it when you push, pull or fetch.',
    docs: 'remotes',
  },
  {
    id: 'origin',
    term: 'origin',
    definition:
      'The nickname Git gives the remote you cloned from. At Inkwell, origin means GitNub.',
    docs: 'remotes',
  },
  {
    id: 'working-files',
    term: 'working files',
    aliases: ['working tree', 'working directory'],
    definition:
      'The files on your computer, as they are right now, including edits you haven’t committed yet.',
    docs: 'recordingChanges',
  },
  {
    id: 'staging-area',
    term: 'staging area',
    aliases: ['stage', 'staged', 'staging', 'index'],
    definition:
      'A waiting area for changes you’ve picked for your next commit. `git add` puts changes there.',
    docs: 'recordingChanges',
  },
  {
    id: 'commit',
    term: 'commit',
    aliases: ['commits', 'committed'],
    definition:
      'A saved snapshot of your staged changes, with a message, your name and a time. Commits are the history.',
    docs: 'gitCommit',
  },
  {
    id: 'commit-message',
    term: 'commit message',
    definition:
      'A short note saying what a commit changes and why, such as “Add Ada to team list”.',
    docs: 'gitCommit',
  },
  {
    id: 'push',
    term: 'push',
    aliases: ['pushed', 'pushing'],
    definition: 'Send your new commits from your computer up to a remote such as GitNub.',
    docs: 'gitPush',
  },
  {
    id: 'fetch',
    term: 'fetch',
    aliases: ['fetched'],
    definition:
      'Download what’s new on the remote without changing your files. It updates your computer’s memory of GitNub.',
    docs: 'gitFetch',
  },
  {
    id: 'pull',
    term: 'pull',
    aliases: ['pulled', 'pulling'],
    definition:
      'Fetch what’s new on the remote, then bring it into your current branch. Fetch plus merge, in one command.',
    docs: 'gitPull',
  },
  {
    id: 'branch',
    term: 'branch',
    aliases: ['branches'],
    definition:
      'A named line of work. You make a branch for each change so it can be reviewed before it joins `main`.',
    docs: 'branching',
  },
  {
    id: 'main',
    term: 'main',
    definition: 'The team’s shared branch. What’s on `main` is what gets published.',
    docs: 'branching',
  },
  {
    id: 'origin-main',
    term: 'origin/main',
    definition:
      'Your computer’s memory of GitNub’s `main`, as of your last fetch, pull or push. It can be out of date.',
    docs: 'remotes',
  },
  {
    id: 'pull-request',
    term: 'pull request',
    aliases: ['pr', 'prs', 'pull requests'],
    definition:
      'A request on GitNub to bring your branch into `main`. Teammates review it there before it’s merged.',
    docs: 'pullRequests',
  },
  {
    id: 'base-branch',
    term: 'base branch',
    definition: 'The branch a pull request wants to join, usually `main`.',
    docs: 'pullRequests',
  },
  {
    id: 'review',
    term: 'review',
    aliases: ['approve', 'approval', 'reviewer'],
    definition:
      'A teammate reads your pull request, leaves comments, and approves it when it’s ready to merge.',
    docs: 'pullRequests',
  },
  {
    id: 'merge',
    term: 'merge',
    aliases: ['merged', 'merging'],
    definition:
      'Combine the work from one branch into another. Git joins the two histories together.',
    docs: 'gitMerge',
  },
  {
    id: 'squash-merge',
    term: 'squash merge',
    aliases: ['squash', 'squashed', 'squash and merge'],
    definition:
      'Merge a pull request as one single commit on `main`, however many commits the branch had.',
    docs: 'squashMerge',
  },
  {
    id: 'fast-forward',
    term: 'fast-forward',
    aliases: ['fast-forwarded'],
    definition:
      'The simplest kind of update: your branch just moves ahead to include newer commits, because nothing needs combining.',
    docs: 'gitMerge',
  },
  {
    id: 'rebase',
    term: 'rebase',
    aliases: ['rebased', 'rebasing'],
    definition:
      'Replaying your commits on top of newer work: same changes, new commits. GitNub’s Update branch button does this.',
    docs: 'rebasing',
  },
  {
    id: 'cherry-pick',
    term: 'cherry-pick',
    definition:
      'Copying one specific commit to another branch without bringing the rest of its branch along.',
    docs: 'gitCherryPick',
  },
  {
    id: 'merge-conflict',
    term: 'merge conflict',
    aliases: ['conflict', 'conflicts'],
    definition:
      'When two changes touch the same lines, Git can’t pick one. A person decides: keep mine, theirs, or both. Nothing is broken.',
    docs: 'mergeConflicts',
  },
  {
    id: 'conflict-markers',
    term: 'conflict markers',
    definition:
      'The `<<<<<<<`, `=======` and `>>>>>>>` lines you’d see in a text editor around a conflict, showing both versions.',
    docs: 'mergeConflicts',
  },
]

export function findGlossaryEntry(word: string): GlossaryEntry | undefined {
  const needle = word.toLowerCase()
  return GLOSSARY.find((entry) => entry.term === needle || entry.aliases?.includes(needle))
}
