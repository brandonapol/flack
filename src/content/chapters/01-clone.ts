import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { DOCS_SITE, DOCS_SITE_URL } from '../world'
import { local, ran } from './helpers'

export const cloneChapter: Chapter = {
  id: '01-clone',
  title: 'Get the repo',
  milestone: 'day-one',
  intro:
    'Jordan wants you to add your name to the team list. First you need Inkwell’s docs on your own computer.',
  setup: (state) => ({
    ...state,
    ui: { ...state.ui, unlockedTabs: ['flack', 'gitnub'] },
  }),
  steps: [
    {
      id: 'open-repo',
      title: 'Open inkwell/docs-site on GitNub',
      body: 'On the GitNub tab, open **docs-site**. (The other two repos are not ours today — `website` is the marketing site, and `old-wiki` is archived.)',
      hints: ['Click **docs-site** in the list of repositories.'],
      goal: (_state, event) => event.type === 'repoViewed' && event.slug === DOCS_SITE,
      afterNote:
        'This is a **repository**: a folder of files that Git keeps the full history of. Every change ever made to these docs is in here.',
      onEnter: [{ type: 'openTab', tab: 'gitnub' }],
      docs: [DOCS.whatIsGit],
    },
    {
      id: 'copy-url',
      title: 'Copy the repo’s address',
      body: 'Click the green **Code** button, then **Copy**. That address is what tells your computer where to fetch the files from.',
      hints: [
        'The **Code** button is on the right, above the file list.',
        'Click **Code**, then the **Copy** button next to the address.',
      ],
      goal: (_state, event) => event.type === 'cloneUrlCopied' && event.slug === DOCS_SITE,
    },
    {
      id: 'clone',
      title: 'Clone it with git clone',
      body: `In the terminal, type \`git clone \` and paste the address, then press Enter. **Cloning** copies the whole repository — files and history — onto your computer.`,
      hints: [
        'Click the terminal, type `git clone `, then paste with Ctrl+V (in Git Bash, Shift+Insert or a right-click works too).',
        `Type: git clone ${DOCS_SITE_URL}`,
      ],
      solution: `git clone ${DOCS_SITE_URL}`,
      goal: (state, event) => ran(event, 'git', 'clone') && Boolean(local(state)),
      afterNote:
        'You now have your own complete copy. GitNub still has its copy — from here on there are two, and they only match when you make them match.',
      docs: [DOCS.gitClone],
      onComplete: [
        {
          type: 'flackMessage',
          id: 'robin-hello',
          channel: 'dm-robin',
          from: 'robin',
          text: 'Hi! I’m Robin — shout if anything looks strange. You can ask me things from the buttons in this chat, any time.',
          delayMs: 4000,
        },
      ],
    },
    {
      id: 'ls',
      title: 'See the new folder',
      body: 'Run `ls` to list what’s in the folder you’re in. Cloning made a new folder called `docs-site`.',
      hints: ['Type `ls` and press Enter.'],
      solution: 'ls',
      goal: (_state, event) => ran(event, 'ls'),
    },
    {
      id: 'cd',
      title: 'Go into the folder',
      body: 'Run `cd docs-site` to move into it. Git commands only work inside the repo’s folder — the prompt will show `(main)` once you’re there.',
      hints: [
        'Type `cd docs-site` and press Enter.',
        '`cd` means “change directory”. `cd ..` goes back up.',
      ],
      solution: 'cd docs-site',
      goal: (state, event) => ran(event, 'cd') && state.shell.cwd.endsWith('/docs-site'),
      afterNote:
        '`main` is the branch you’re on: the team’s shared version of the docs. More on branches shortly.',
      docs: [DOCS.commandLine],
    },
    {
      id: 'look-around',
      title: 'Look at a file (optional)',
      body: 'Run `ls` again to see the files, and `cat README.md` to read one without opening an editor.',
      optional: true,
      hints: ['Try `cat README.md`.'],
      solution: 'cat README.md',
      goal: (_state, event) => ran(event, 'cat') || ran(event, 'ls'),
    },
  ],
  mentorQuestions: ['what-is-a-repo', 'how-do-i-clone', 'what-is-a-terminal'],
  summary: [
    '`git clone <address>` copies a repository from GitNub onto your computer.',
    '`ls` lists files, `cd <folder>` moves into a folder, `cat <file>` prints one.',
    'There are now two copies of the docs: GitNub’s and yours.',
  ],
}
