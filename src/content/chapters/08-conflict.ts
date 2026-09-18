import { findPullRequest, openPullRequestFor } from '../../engine/git/pullRequests'
import { clone } from '../../engine/git/repo'
import type { GameState } from '../../engine/game'
import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { SAM_TIP } from '../labScenarios'
import { DOCS_SITE } from '../world'
import { addedLines, docsSite, keptExistingLines, local, ran } from './helpers'

const STYLE_GUIDE = 'docs/style-guide.md'

function myPullRequest(state: GameState) {
  const repo = local(state)
  return repo && repo.head !== 'main' ? openPullRequestFor(docsSite(state), repo.head) : undefined
}

/** Exactly one new bullet, at the very bottom of the file (the end of Team tips). */
function tipAdded(state: GameState): boolean {
  const added = addedLines(state, STYLE_GUIDE)
  if (added.length !== 1 || !/^\s*[-*]\s+\S/.test(added[0])) return false
  const lines = (local(state)?.working[STYLE_GUIDE] ?? '').split('\n').filter((l) => l.trim())
  return lines.at(-1) === added[0] && keptExistingLines(state, STYLE_GUIDE)
}

/**
 * After resolving on GitNub: does the PR branch have Sam's tip *and* everything from the learner's
 * own version (the branch before the resolution)?
 */
function keptBoth(state: GameState, number: number): boolean {
  const remote = docsSite(state)
  const pr = findPullRequest(remote, number)
  if (!pr?.resolvedFrom) return false
  const resolved = remote.commits[remote.branches[pr.branch]].tree[STYLE_GUIDE] ?? ''
  const mine = remote.commits[pr.resolvedFrom].tree[STYLE_GUIDE] ?? ''
  return (
    resolved.includes(SAM_TIP) &&
    mine
      .split('\n')
      .filter((line) => line.trim())
      .every((line) => resolved.includes(line))
  )
}

export const conflictChapter: Chapter = {
  id: '08-conflict',
  title: 'Two people, one spot',
  milestone: 'keeping-in-sync',
  intro:
    'Everyone’s adding a tip to the style guide today, at the same spot. Sooner or later two changes touch the same lines — that’s a conflict. It’s normal, it’s low-stakes, and usually the answer is: keep both.',
  setup: (state) => {
    const repo = state.git.local ?? clone(state.git.remotes[DOCS_SITE])
    return {
      ...state,
      git: {
        ...state.git,
        local: repo,
        config: {
          ...state.git.config,
          userName: state.git.config.userName ?? state.player.name ?? 'You',
          userEmail: state.git.config.userEmail ?? 'you@inkwell.example',
        },
      },
      shell: { ...state.shell, cwd: `/Users/you/${repo.dir}` },
      ui: { ...state.ui, unlockedTabs: ['flack', 'gitnub', 'editor'] },
    }
  },
  steps: [
    {
      id: 'branch',
      title: 'Start a branch',
      body: 'Jordan wants everyone’s favourite writing tip in the style guide. Start a branch: `git switch -c {{player.slug}}-tip`.',
      hints: ['Make sure you’re on an up-to-date `main` first: `git switch main`, `git pull`.'],
      solution: 'git switch -c {{player.slug}}-tip',
      goal: (state, event) => ran(event, 'git', 'switch') && local(state)?.head !== 'main',
      onEnter: [
        {
          type: 'flackMessage',
          id: 'jordan-tips',
          channel: 'docs-team',
          from: 'jordan',
          text: 'Team challenge 📝 Everyone add your favourite writing tip to the bottom of **Team tips** in `docs/style-guide.md`. One line each!',
        },
      ],
    },
    {
      id: 'add-tip',
      title: 'Add your tip and save',
      body: `Open \`${STYLE_GUIDE}\` and add one line at the very bottom, starting with \`- \`: your favourite writing tip. Then save.`,
      hints: [
        `Run \`open ${STYLE_GUIDE}\`.`,
        'Go to the last line of the file and add something like `- Say the most important thing first.`',
      ],
      editableFiles: [STYLE_GUIDE],
      goal: (state, event) =>
        event.type === 'fileSaved' && event.path === STYLE_GUIDE && tipAdded(state),
      reactions: [
        {
          id: 'not-at-the-bottom',
          when: (state, event) =>
            event.type === 'fileSaved' && event.path === STYLE_GUIDE && !tipAdded(state),
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'Nearly! Add **one** new line, starting with `- `, as the very last line of the file — the bottom of Team tips — and keep everything else as it was.',
            },
          ],
        },
      ],
    },
    {
      id: 'commit',
      title: 'Commit and push',
      body: `\`git add ${STYLE_GUIDE}\`, \`git commit -m "Add my writing tip"\`, then \`git push -u origin {{player.slug}}-tip\`.`,
      hints: ['Three commands: add, commit, push. The prompt shows your branch name.'],
      goal: (_state, event) => event.type === 'branchPushed',
    },
    {
      id: 'open-pr',
      title: 'Open a pull request',
      body: 'On GitNub: **Compare & pull request**, then **Create pull request**.',
      hints: ['The banner on the docs-site page has the button.'],
      goal: (_state, event) => event.type === 'pullRequestOpened',
      onComplete: [
        {
          type: 'remoteCommit',
          slug: DOCS_SITE,
          author: 'sam',
          message: 'Add my writing tip (#10)',
          edits: [{ kind: 'appendLine', path: STYLE_GUIDE, text: SAM_TIP }],
          delayMs: 4000,
        },
        {
          type: 'flackMessage',
          id: 'sam-tip',
          channel: 'docs-team',
          from: 'sam',
          text: 'Added my tip! 💡',
          delayMs: 4500,
        },
      ],
    },
    {
      id: 'conflict',
      title: 'Your PR has a conflict',
      body: 'Keep an eye on your pull request. Sam just merged a tip too…',
      hints: ['Open your pull request on GitNub.'],
      goal: (state, event) =>
        (event.type === 'remoteUpdated' || event.type === 'stepEntered') &&
        myPullRequest(state)?.status === 'has-conflicts',
      afterNote:
        'Conflicts only happen when two people change the **same lines**. Different parts of the same file merge fine on their own — like in Chapter 6.',
      onComplete: [
        {
          type: 'flackMessage',
          channel: 'dm-robin',
          from: 'robin',
          text: 'Saw your PR says it has conflicts — this is the most normal thing in the world, and nothing is broken. You and Sam both added a line at the same spot, so Git wants a human to say what the result should be. That’s all.',
          delayMs: 800,
        },
      ],
    },
    {
      id: 'see-why',
      title: 'See what’s conflicting',
      body: 'On your pull request, click **See what’s conflicting →**. In the Commit Lab, combine the two branches, try **Keep mine** and **Keep theirs**, and see what each leaves out. Click **I get it** when you’re done.',
      hints: [
        'The button is in the conflict banner on your pull request.',
        'Drag your commit onto Sam’s and choose **Merge with here**.',
      ],
      goal: (_state, event) =>
        event.type === 'commitLabCompleted' && event.scenario === 'pr-conflict',
      docs: [DOCS.mergeConflicts],
    },
    {
      id: 'resolve',
      title: 'Keep both, and mark it resolved',
      body: 'Back on your pull request: under `docs/style-guide.md`, choose **Keep both**, then **Mark as resolved**.',
      hints: [
        'The conflict banner lists the file with three buttons: Keep mine, Keep theirs, Keep both.',
        'Pick **Keep both** — the preview shows both tips — then **Mark as resolved**.',
      ],
      goal: (state, event) => event.type === 'conflictsResolved' && keptBoth(state, event.number),
      afterNote:
        '💡 In a text editor you’d see `<<<<<<<` markers around the two versions — same idea, and you’d pick the same way.',
      reactions: [
        {
          id: 'dropped-one',
          when: (state, event) =>
            event.type === 'conflictsResolved' && !keptBoth(state, event.number),
          effects: [
            {
              type: 'flackMessage',
              channel: 'dm-robin',
              from: 'robin',
              text: 'That works as far as Git is concerned — but one of the tips is gone now. Click **Undo and choose again** on your pull request and pick **Keep both**.',
            },
          ],
        },
      ],
      onComplete: [
        {
          type: 'reviewPullRequest',
          slug: DOCS_SITE,
          number: 'latest',
          author: 'jordan',
          body: 'Both tips in — perfect. 🙌',
          approve: true,
          delayMs: 3000,
        },
      ],
    },
    {
      id: 'merge',
      title: 'Squash and merge it',
      body: 'Once Jordan approves, **Squash and merge**.',
      hints: ['The button is at the bottom of the pull request.'],
      goal: (_state, event) => event.type === 'pullRequestMerged',
      onComplete: [
        {
          type: 'flackMessage',
          id: 'sam-both',
          channel: 'docs-team',
          from: 'sam',
          text: 'Ha, we picked the same spot! Glad both tips made it. 😄',
          delayMs: 1500,
          quickReplies: [
            { id: 'high-five', text: 'Great minds! 🙌' },
            { id: 'nice-tip', text: 'Nice tip, by the way' },
          ],
        },
      ],
    },
    {
      id: 'reply-sam',
      title: 'Reply to Sam',
      body: 'Sam has posted in `#docs-team`. Reply with one of the buttons.',
      hints: ['The reply buttons are under Sam’s message.'],
      goal: (_state, event) => event.type === 'flackReply' && event.messageId === 'sam-both',
    },
    {
      id: 'bonus',
      title: 'Bonus: the rarer kind',
      body: 'Sometimes “keep both” is wrong: when two people rewrite the **same sentence**, one has to win. Robin has a short challenge in the Commit Lab.',
      hints: ['Open the Commit Lab from Robin’s message, merge, and pick one side.'],
      optional: true,
      goal: (_state, event) =>
        event.type === 'commitLabCompleted' && event.scenario === 'bonus-reword',
      onEnter: [
        {
          type: 'flackMessage',
          channel: 'dm-robin',
          from: 'robin',
          text: 'One more, if you like — the rarer kind. You and Alex both reworded the same sentence. Keep both, and it says the same thing twice…',
          lab: 'bonus-reword',
        },
      ],
    },
  ],
  mentorQuestions: ['pr-has-conflicts', 'what-are-markers', 'i-broke-it'],
  summary: [
    'A **conflict** means two changes touched the same lines. Nothing is broken; someone just chooses.',
    'On GitNub you pick **Keep mine**, **Keep theirs** or **Keep both** — for lists, usually both.',
    'When two people rewrite the same sentence, keeping both is wrong: pick one.',
  ],
}
