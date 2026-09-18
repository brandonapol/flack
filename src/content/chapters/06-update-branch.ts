import { openPullRequestFor } from '../../engine/git/pullRequests'
import { clone } from '../../engine/git/repo'
import type { GameState } from '../../engine/game'
import type { Chapter } from '../../engine/story/types'
import { DOCS } from '../docsLinks'
import { DOCS_SITE, STYLE_GUIDE_TYPO } from '../world'
import { docsSite, local, ran } from './helpers'

const STYLE_GUIDE = 'docs/style-guide.md'

/** The learner's open pull request, from whichever branch they're on. */
function myPullRequest(state: GameState) {
  const repo = local(state)
  return repo && repo.head !== 'main' ? openPullRequestFor(docsSite(state), repo.head) : undefined
}

/** Is the typo fixed in the file on disk? */
function fixed(state: GameState): boolean {
  const text = local(state)?.working[STYLE_GUIDE] ?? ''
  return text.includes('receive') && !text.includes(STYLE_GUIDE_TYPO)
}

export const updateBranchChapter: Chapter = {
  id: '06-update-branch',
  title: 'Two PRs, one file',
  milestone: 'keeping-in-sync',
  intro:
    'You know the loop now. This time somebody else’s pull request lands while yours is waiting for review — which happens all the time, and takes one button to sort out.',
  setup: (state) => {
    const repo = state.git.local ?? clone(state.git.remotes[DOCS_SITE])
    const name = state.git.config.userName ?? state.player.name ?? 'You'
    return {
      ...state,
      git: {
        ...state.git,
        local: repo,
        // Started on its own, the learner hasn't met the identity gotcha; don't make them now.
        config: {
          ...state.git.config,
          userName: name,
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
      body: 'Jordan has a small job for you. Start a branch for it: `git switch -c {{player.slug}}-typo`.',
      hints: ['Type `git switch -c {{player.slug}}-typo` and press Enter.'],
      solution: 'git switch -c {{player.slug}}-typo',
      goal: (state, event) => ran(event, 'git', 'switch') && local(state)?.head !== 'main',
      docs: [DOCS.gitSwitch],
      onEnter: [
        {
          type: 'flackMessage',
          id: 'jordan-typo',
          channel: 'docs-team',
          from: 'jordan',
          text: `Could you fix a typo in \`${STYLE_GUIDE}\`? Somebody wrote “${STYLE_GUIDE_TYPO}” 🙃 Same as before: branch, commit, push, pull request.`,
        },
      ],
    },
    {
      id: 'fix',
      title: 'Fix the typo and save',
      body: `Open \`${STYLE_GUIDE}\`, change “${STYLE_GUIDE_TYPO}” to “receive”, and save.`,
      hints: [
        `Run \`open ${STYLE_GUIDE}\`, or pick it in the Editor.`,
        'It’s in the **Formatting** list. Save with ⌘S / Ctrl+S.',
      ],
      editableFiles: [STYLE_GUIDE],
      goal: (state, event) =>
        event.type === 'fileSaved' && event.path === STYLE_GUIDE && fixed(state),
    },
    {
      id: 'commit',
      title: 'Commit it',
      body: `Stage and commit: \`git add ${STYLE_GUIDE}\`, then \`git commit -m "Fix a typo in the style guide"\`.`,
      hints: [
        `\`git add ${STYLE_GUIDE}\` first, then the commit.`,
        '`git status` shows what’s staged.',
      ],
      solution: 'git commit -m "Fix a typo in the style guide"',
      goal: (state, event) => {
        const repo = local(state)
        if (!ran(event, 'git', 'commit') || !repo || repo.head === 'main') return false
        return (
          repo.commits[repo.branches[repo.head]].tree[STYLE_GUIDE]?.includes('receive') ?? false
        )
      },
      docs: [DOCS.gitCommit],
    },
    {
      id: 'push',
      title: 'Push your branch',
      body: 'Send it up: `git push -u origin {{player.slug}}-typo`.',
      hints: ['Push the branch you’re on — the prompt shows its name.'],
      solution: 'git push -u origin {{player.slug}}-typo',
      goal: (_state, event) => event.type === 'branchPushed',
      docs: [DOCS.gitPush],
    },
    {
      id: 'open-pr',
      title: 'Open a pull request',
      body: 'On GitNub: **Compare & pull request**, then **Create pull request**.',
      hints: ['The banner on the docs-site page has the button.'],
      goal: (_state, event) => event.type === 'pullRequestOpened',
      afterNote: 'Jordan’s in a meeting, so the review will take a little while.',
      docs: [DOCS.pullRequests],
      onComplete: [
        {
          type: 'remoteCommit',
          slug: DOCS_SITE,
          author: 'alex',
          message: 'Add two team tips (#8)',
          edits: [
            {
              kind: 'appendLine',
              path: STYLE_GUIDE,
              text: '- Ask for a review early: small pull requests get reviewed faster.',
            },
          ],
          delayMs: 4000,
        },
        {
          type: 'flackMessage',
          id: 'alex-tips',
          channel: 'docs-team',
          from: 'alex',
          text: 'Just merged my team tips PR into the style guide 🎉',
          delayMs: 4500,
        },
      ],
    },
    {
      id: 'out-of-date',
      title: 'Notice your PR is out of date',
      body: 'While you wait, keep an eye on your pull request on GitNub. Alex just merged something into the same file…',
      hints: ['Give it a few seconds, then look at your pull request page.'],
      // Alex's merge may land before or after this step starts.
      goal: (state, event) =>
        (event.type === 'remoteUpdated' || event.type === 'stepEntered') &&
        myPullRequest(state)?.status === 'needs-update',
      afterNote:
        'Out of date isn’t an error. It just means someone else was faster: `main` moved after you opened your pull request, so a PR can be fine one minute and out of date the next.',
      onComplete: [
        {
          type: 'flackMessage',
          channel: 'dm-robin',
          from: 'robin',
          text: 'Heads up: your pull request now says it’s out of date. Nothing’s wrong — Alex’s change landed first, in a different part of the same file. **Update branch** puts your commit on top of theirs. Want to see what that looks like first? Drag it around:',
          lab: 'out-of-date',
          delayMs: 800,
        },
      ],
    },
    {
      id: 'update',
      title: 'Click Update branch',
      body: 'On your pull request, click **Update branch**.',
      hints: [
        'GitNub tab → **Pull requests** → your pull request. The yellow banner has the button.',
      ],
      goal: (_state, event) => event.type === 'branchUpdated',
      afterNote:
        '💡 **Update branch** did a **rebase** for you — the same thing you can drag in the Commit Lab. Your commit now sits on top of Alex’s, and nothing of either was lost.',
      docs: [DOCS.rebasing],
      onComplete: [
        {
          type: 'reviewPullRequest',
          slug: DOCS_SITE,
          number: 'latest',
          author: 'jordan',
          body: 'Thanks for catching that! 🙏',
          approve: true,
          delayMs: 3000,
        },
        {
          type: 'flackMessage',
          channel: 'docs-team',
          from: 'jordan',
          text: 'Approved your typo fix — squash-merge away.',
          delayMs: 3200,
        },
      ],
    },
    {
      id: 'merge',
      title: 'Squash and merge it',
      body: 'Once Jordan approves, **Squash and merge** your pull request.',
      hints: [
        'The button is at the bottom of the pull request. Then **Confirm squash and merge**.',
      ],
      goal: (_state, event) => event.type === 'pullRequestMerged',
      docs: [DOCS.squashMerge],
    },
    {
      id: 'catch-up',
      title: 'Back to main, and pull',
      body: 'In the terminal: `git switch main`, then `git pull`. You’ll get Alex’s tips and your fix.',
      hints: ['`git switch main` first, then `git pull`.'],
      solution: 'git pull',
      goal: (state, event) => {
        const repo = local(state)
        return (
          ran(event, 'git', 'pull') &&
          repo?.head === 'main' &&
          repo.branches.main === docsSite(state).branches.main
        )
      },
    },
  ],
  mentorQuestions: ['out-of-date-branch', 'what-is-a-rebase', 'i-broke-it'],
  summary: [
    'A pull request goes **out of date** when `main` moves after you opened it. That’s normal.',
    '**Update branch** rebases your commits on top of the new `main` — same changes, new commits.',
    'GitNub won’t merge an out-of-date branch, so nothing someone else merged gets lost.',
  ],
}
