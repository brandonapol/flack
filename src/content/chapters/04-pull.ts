import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { DOCS_SITE } from '../world'
import { ran, withClone, working } from './helpers'

export const pullChapter: Chapter = {
  id: '04-someone-else-changed-it',
  title: 'Someone else changed it',
  milestone: 'day-one',
  intro:
    'Sam Rivera started today too, and has just been through the same loop. Their change is on GitNub. Yours isn’t affected — but your copy is now out of date.',
  setup: (state) => ({
    ...withClone(state),
    ui: { ...state.ui, unlockedTabs: ['flack', 'gitnub', 'editor'] },
  }),
  steps: [
    {
      id: 'read-sam',
      title: 'See Sam’s message',
      body: 'Sam has posted in `#docs-team`. Open the Flack tab and have a look.',
      hints: ['Click the **Flack** tab, then `#docs-team`.'],
      goal: (_state, event) => event.type === 'channelOpened' && event.channel === 'docs-team',
      onEnter: [
        {
          type: 'remoteCommit',
          slug: DOCS_SITE,
          author: 'sam',
          message: 'Add Sam Rivera to the team list (#5)',
          edits: [{ kind: 'appendLine', path: 'team.md', text: '- Sam Rivera' }],
          delayMs: 3000,
        },
        {
          type: 'flackMessage',
          id: 'sam-hello',
          channel: 'docs-team',
          from: 'sam',
          text: 'Hi all — Sam here, also new today. Just merged my first pull request, I added my name to `team.md` 👋',
          delayMs: 4000,
          quickReplies: [
            { id: 'welcome', text: 'Welcome, Sam! 🎉' },
            { id: 'same-boat', text: 'Same here — first day too!' },
          ],
        },
      ],
    },
    {
      id: 'look-at-team',
      title: 'Open team.md and notice what’s missing',
      body: 'Open `team.md` in the Editor. Sam’s name isn’t there. Your copy of the repo hasn’t changed since you pulled — it doesn’t check GitNub on its own.',
      hints: ['Run `open team.md`, or click the Editor tab and pick the file.'],
      solution: 'open team.md',
      goal: (_state, event) => event.type === 'fileOpened' && event.path === 'team.md',
      afterNote:
        'Even `git status` will say you’re up to date: it’s comparing against your computer’s *memory* of GitNub, which is also out of date.',
    },
    {
      id: 'pull',
      title: 'Run git pull',
      body: 'In the terminal, run `git pull`. It fetches what’s new on GitNub and brings it into your branch.',
      hints: [
        'Type `git pull` and press Enter.',
        'Make sure you’re on `main` — the prompt shows the branch.',
      ],
      solution: 'git pull',
      goal: (state, event) =>
        ran(event, 'git', 'pull') && Boolean(working(state, 'team.md')?.includes('- Sam Rivera')),
      afterNote:
        'Sam’s name appears in the Editor straight away: `git pull` changed the files on your computer.',
      docs: [DOCS.gitPull],
    },
    {
      id: 'reply-sam',
      title: 'Say hi to Sam',
      body: 'Reply to Sam in `#docs-team` with one of the buttons.',
      hints: ['The reply buttons are under Sam’s message in `#docs-team`.'],
      goal: (_state, event) => event.type === 'flackReply' && event.messageId === 'sam-hello',
      onComplete: [
        {
          type: 'flackMessage',
          channel: 'docs-team',
          from: 'jordan',
          text: 'Nice work today, {{player.name}}! 🎉 That’s the whole loop, by the way — branch, commit, push, pull request, squash-merge, pull. Everything else builds on it. ☕',
          delayMs: 3000,
        },
      ],
    },
  ],
  mentorQuestions: ['what-is-a-pr', 'save-vs-commit', 'i-broke-it'],
  summary: [
    'Your copy doesn’t update on its own: `git pull` brings down what other people merged.',
    'Everyone on the team uses the same loop, including the people reviewing your work.',
  ],
}
