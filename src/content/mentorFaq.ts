import type { MentorEntry } from '../engine/story/types'
import { DOCS } from './docsLinks'

const link = (key: keyof typeof DOCS) => `[${DOCS[key].label}](${DOCS[key].href})`

/**
 * Robin's answers. Each one is: the short answer, the command or button to use, and where to read
 * more. Robin never assumes the learner did something wrong.
 */
export const MENTOR_FAQ: Record<string, MentorEntry> = {
  'what-is-git': {
    question: 'What even is Git?',
    answer: `Git keeps the history of a folder of files. Every time you save a set of changes (a **commit**), it remembers exactly what changed, who changed it and when — so nothing is ever really lost.\n\nMore: ${link('whatIsGit')}`,
  },
  'what-is-a-repo': {
    question: 'What’s a repository?',
    answer: `A repository ("repo") is a project folder Git is watching. Ours is \`docs-site\`: every page on our docs site lives in it.\n\nGitNub has the shared copy; \`git clone\` makes you your own.`,
  },
  'what-is-a-terminal': {
    question: 'I’ve never used a terminal. Help?',
    answer: `It’s just a place to type instructions instead of clicking. You type a line, press Enter, and it prints an answer. Nothing here can break.\n\nHandy ones: \`pwd\` (where am I), \`ls\` (what’s here), \`cd folder\` (go in), \`cd ..\` (go back up).\n\nMore: ${link('commandLine')}`,
  },
  'how-do-i-clone': {
    question: 'How do I get the repo onto my computer?',
    answer:
      'On GitNub, open the repo, click the green **Code** button, copy the address, then in the terminal run `git clone <paste>`. That downloads a full copy with all its history.',
  },
  'add-vs-commit': {
    question: 'What’s the difference between add and commit?',
    answer: `\`git add\` picks which changes go into your next save point. \`git commit\` makes that save point, with a message.\n\nThink of \`add\` as putting things in a box, and \`commit\` as taping the box shut and labelling it.\n\nMore: ${link('recordingChanges')}`,
  },
  'save-vs-commit': {
    question: 'I saved the file. Isn’t that enough?',
    answer:
      'Saving updates the file on your computer. Committing records *that version* in the history, and pushing sends it to GitNub for everyone else. Three different steps, on purpose.',
  },
  'what-is-a-branch': {
    question: 'What’s a branch, and why do we use them?',
    answer: `A branch is your own line of work, named after what you’re doing: \`git switch -c add-my-name\`. You commit there, push it, and open a pull request. \`main\` only changes once someone has reviewed it.\n\nMore: ${link('branching')}`,
  },
  'what-is-a-pr': {
    question: 'What’s a pull request?',
    answer: `A pull request (PR) is a page on GitNub that says "here’s my branch, please look". Teammates read the changes, comment, approve — and then it’s merged into \`main\`.\n\nMore: ${link('pullRequests')}`,
  },
  'what-is-squash-merge': {
    question: 'What does “Squash and merge” mean?',
    answer: `It takes every commit on your branch and lands them on \`main\` as **one** tidy commit. That’s why our history reads like a list of finished changes rather than "wip", "typo", "actually fix it".\n\nMore: ${link('squashMerge')}`,
  },
  'out-of-date-branch': {
    question: 'My PR says it’s out of date with the base branch. What now?',
    answer:
      'Click **Update branch** on the pull request page. Someone else’s work landed on `main` first, and that button brings your branch up to date with it. Nothing is wrong, and nothing is lost.',
  },
  'what-is-a-rebase': {
    question: 'What’s a rebase, really?',
    answer: `It replays your commits on top of newer work, so history stays a straight line: same changes, new commits. That’s what **Update branch** does for you.\n\nMore: ${link('rebasing')}`,
  },
  'what-is-cherry-pick': {
    question: 'What’s cherry-picking?',
    answer: `Copying one specific commit onto another branch, without bringing the rest of its branch along. It’s occasionally handy: "just that one fix, please".\n\nMore: ${link('gitCherryPick')}`,
  },
  'pr-has-conflicts': {
    question: 'My PR says it has conflicts. Help!',
    answer: `Totally normal, and nothing is broken. It means you and someone else changed the same lines, so Git wants a human to choose. On the PR page you pick **Keep mine**, **Keep theirs** or **Keep both** — usually both.\n\nMore: ${link('mergeConflicts')}`,
  },
  'what-are-markers': {
    question: 'What do the `<<<<<<<` symbols mean?',
    answer:
      'In a text editor, Git marks a conflict with `<<<<<<<`, `=======` and `>>>>>>>` around the two versions: yours above the divider, theirs below. Here you get buttons instead, but now you’ll recognise them in the wild.',
  },
  'push-to-main': {
    question: 'I tried to push to `main` and it didn’t go well',
    answer:
      'On this team `main` changes through pull requests, so pushing straight to it isn’t the path. Start a branch instead: `git switch -c my-change`, commit, `git push -u origin my-change`, then open the PR.',
  },
  'delete-branch': {
    question: 'Do I have to delete my branch after merging?',
    answer:
      'Yes, and it’s safe: your work is on `main` now, as its own commit. Deleting the branch just clears the shelf. GitNub offers a **Delete branch** button right after merging.',
  },
  'i-broke-it': {
    question: 'I think I broke something',
    answer:
      'You almost certainly haven’t, and in Flack you definitely haven’t. Git keeps every commit, GitNub still has its copy, and there’s a **Restart chapter** button at the bottom left. Tell me what you ran and we’ll read it together.',
  },
  'undo-my-edit': {
    question: 'How do I undo an edit I haven’t committed?',
    answer:
      '`git restore <file>` throws away unsaved-to-Git changes in that file, and `git restore --staged <file>` unstages something you added by mistake. Both only touch your copy.',
  },
}

/** Questions Robin always offers, whatever chapter you're on. */
export const GENERAL_QUESTIONS = ['what-is-a-terminal', 'add-vs-commit', 'i-broke-it']
