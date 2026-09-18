import type { GameEvent } from '../../engine/events'
import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { MERGE_VS_REBASE } from '../labScenarios'

const finished = (scenario: string) => (_state: unknown, event: GameEvent) =>
  event.type === 'commitLabCompleted' && event.scenario === scenario && event.mode === 'guided'

export const tidierHistoryChapter: Chapter = {
  id: '07-tidier-history',
  title: 'A tidier history',
  milestone: 'keeping-in-sync',
  intro:
    'No terminal today. You’ve squashed and rebased already — by clicking buttons on GitNub. Now you’ll do both by hand in the Commit Lab, so you can see what they do to history.',
  setup: (state) => ({
    ...state,
    ui: { ...state.ui, unlockedTabs: ['flack', 'gitnub', 'editor'] },
  }),
  steps: [
    {
      id: 'read-robin',
      title: 'See why we squash',
      body: 'Robin has sent you a message about the team’s history. Open the DM in Flack.',
      hints: ['Flack tab → **Robin Okafor** under Direct messages.'],
      goal: (_state, event) => event.type === 'channelOpened' && event.channel === 'dm-robin',
      onEnter: [
        {
          type: 'flackMessage',
          id: 'robin-why-squash',
          channel: 'dm-robin',
          from: 'robin',
          text: 'Here’s why we squash. On a team that doesn’t, `main` reads like this: `wip` · `fix typo` · `actually fix typo` · `final`. Ours reads like `Add two team tips (#8)` · `Fix a typo in the style guide (#7)` — one line per finished change. Much easier to follow when something goes wrong! Let’s tidy a branch by hand.',
        },
      ],
    },
    {
      id: 'squash',
      title: 'Squash four commits into one',
      body: 'In the Commit Lab, drag `wip` onto `final` — or select one with Enter, then the other — and choose **Squash into here**. Four commits become one.',
      hints: [
        'Pick up the first commit on your branch and drop it on the last one.',
        'Choose **Squash into here** from the menu.',
      ],
      goal: finished('tidy-squash'),
      afterNote:
        'Same change, one commit. That’s what **Squash and merge** does on GitNub, every time.',
      docs: [DOCS.squashMerge],
      onEnter: [{ type: 'openCommitLab', scenario: 'tidy-squash', delayMs: 1200 }],
    },
    {
      id: 'rebase',
      title: 'Make history one straight line',
      body: '`main` has moved on again. Put your commit on top of Alex’s so history is one straight line.\n\n💡 **The golden rule:** rebasing rewrites commits, so only do it to work that hasn’t been merged yet. The **Update branch** button on your own pull request is always safe.',
      hints: [
        'Drop your commit onto Alex’s, the newest on `main`.',
        'Merge also works, but makes a fork and a join. **Rebase onto here** gives one straight line.',
      ],
      goal: finished('tidy-rebase'),
      figure: MERGE_VS_REBASE,
      afterNote:
        'You already did this in Chapter 6 — that’s all the **Update branch** button was doing.',
      docs: [DOCS.rebasing],
      onEnter: [{ type: 'openCommitLab', scenario: 'tidy-rebase', delayMs: 1500 }],
    },
  ],
  mentorQuestions: ['what-is-squash-merge', 'what-is-a-rebase', 'what-is-cherry-pick'],
  summary: [
    '**Squash** turns several small commits into one clean one before it joins `main`.',
    '**Rebase** replays your commits on top of the latest work: same changes, new commits.',
    'Only rebase work that hasn’t been merged yet. **Update branch** on your own PR is always safe.',
  ],
}
