import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { ran } from './helpers'

export const welcomeChapter: Chapter = {
  id: '00-welcome',
  title: 'Welcome to Inkwell',
  milestone: 'day-one',
  intro:
    'It’s your first day as a technical writer at **Inkwell**. Your laptop is set up, and the docs team has already noticed you’re online.',
  setup: (state) => ({
    ...state,
    ui: { ...state.ui, activeTab: 'flack', unlockedTabs: ['flack'] },
    flack: { ...state.flack, activeChannel: 'docs-team' },
  }),
  steps: [
    {
      id: 'say-hello',
      title: 'Say hello in #docs-team',
      body: 'Jordan has posted a welcome. Reply with one of the buttons under the message — no typing needed.',
      hints: ['The reply buttons are right under Jordan’s message, in the middle panel.'],
      goal: (_state, event) => event.type === 'flackReply' && event.messageId === 'welcome',
      afterNote:
        'That’s Flack: the team’s chat. Everything in this game happens in these three panels.',
      onEnter: [
        {
          type: 'flackMessage',
          id: 'welcome',
          channel: 'docs-team',
          from: 'jordan',
          text: 'Welcome to the team! 🎉 Grab a coffee, then I’ll get you started on something small and real.',
          quickReplies: [
            { id: 'thanks', text: 'Thanks! Happy to be here 👋' },
            { id: 'ready', text: 'Ready when you are' },
          ],
        },
      ],
      onComplete: [
        {
          type: 'flackMessage',
          id: 'welcome-task',
          channel: 'docs-team',
          from: 'jordan',
          text: 'First task: our docs live in a repository on **GitNub**. Take a look at `inkwell/docs-site` — the GitNub tab is now open for you.',
          delayMs: 2500,
        },
        { type: 'unlockTab', tab: 'gitnub', delayMs: 2500 },
      ],
    },
    {
      id: 'open-gitnub',
      title: 'Open the GitNub tab',
      body: 'GitNub is where Inkwell keeps its files and history. Click the **GitNub** tab in the middle panel.',
      hints: ['The tabs are along the top of the middle panel: Flack, GitNub, Editor.'],
      goal: (_state, event) => event.type === 'tabOpened' && event.tab === 'gitnub',
      afterNote:
        'This is GitNub’s copy of everything. Your computer will get its own copy in a minute, and telling those two apart is most of what Git is about.',
    },
    {
      id: 'try-help',
      title: 'Try the terminal',
      body: 'On the right is a **terminal**: you type a command, press Enter, and it answers. Nothing you type here can break anything. Type `help` and press Enter.',
      hints: ['Click the black panel on the right, type `help`, then press Enter.'],
      solution: 'help',
      goal: (_state, event) => ran(event, 'help'),
      afterNote:
        'Those are all the commands this game understands. You’ll only need a handful today.',
      docs: [DOCS.commandLine],
    },
  ],
  mentorQuestions: ['what-is-a-terminal', 'what-is-git'],
  summary: [
    'Flack is the team chat, GitNub is where the files live, and the terminal is where you type commands.',
    'Nothing here can break, and your progress is saved automatically.',
  ],
}
