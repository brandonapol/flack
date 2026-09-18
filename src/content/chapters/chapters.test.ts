import { describe, expect, it } from 'vitest'

import { blankState, type Action, type GameState } from '../../engine/game'
import { log } from '../../engine/git/repo'
import { findPullRequest, pullRequestCommits } from '../../engine/git/pullRequests'
import { play, playChapter } from '../../engine/story/harness'
import { startChapter } from '../../engine/game'
import { flushEffects } from '../../engine/story/harness'
import { createGameConfig } from '../config'
import { DOCS_SITE, DOCS_SITE_URL } from '../world'

const config = createGameConfig()
const cmd = (line: string): Action => ({ type: 'runCommand', line })
const NAME = 'Ada Lovelace'

function signTheList(state: GameState): Action {
  const current = state.git.local!.working['team.md']
  return { type: 'saveFile', path: 'team.md', content: `${current}- ${NAME}\n` }
}

const CHAPTER_0: Action[] = [
  { type: 'flackReply', messageId: 'welcome', replyId: 'thanks' },
  { type: 'openTab', tab: 'gitnub' },
  cmd('help'),
]

const CHAPTER_1: Action[] = [
  { type: 'viewRepo', slug: DOCS_SITE },
  { type: 'copyCloneUrl', slug: DOCS_SITE },
  cmd(`git clone ${DOCS_SITE_URL}`),
  cmd('ls'),
  cmd('cd docs-site'),
  cmd('cat README.md'),
]

const CHAPTER_3_AFTER_COMMIT: Action[] = [
  cmd('git push -u origin ada-team-list'),
  {
    type: 'openPullRequest',
    slug: DOCS_SITE,
    branch: 'ada-team-list',
    title: `Add ${NAME} to the team list`,
  },
  { type: 'mergePullRequest', slug: DOCS_SITE, number: 4 },
  { type: 'deleteRemoteBranch', slug: DOCS_SITE, branch: 'ada-team-list' },
  cmd('git switch main'),
  cmd('git pull'),
]

/** Plays every chapter in order, the way a learner would, and hands back the final state. */
function playDayOne(): { state: GameState; traces: Record<string, string[]> } {
  const traces: Record<string, string[]> = {}
  let state = flushEffects(config, ...startChapterAt(blankState(config), '00-welcome'))

  const runChapter = (id: string, actions: (state: GameState) => Action[]) => {
    state = flushEffects(config, ...startChapterAt(state, id))
    state = play(config, state, actions(state))
    traces[id] = state.story.completedSteps
  }

  state = play(config, state, CHAPTER_0)
  traces['00-welcome'] = state.story.completedSteps

  runChapter('01-clone', () => CHAPTER_1)
  runChapter('02-sign-the-list', (current) => [
    { type: 'openFile', path: 'team.md' },
    signTheList(current),
    cmd('git status'),
    cmd('git diff'),
  ])
  runChapter('03-pull-request', (current) => [
    cmd('git switch -c ada-team-list'),
    cmd('git add team.md'),
    // The first commit fails: Git doesn't know who you are yet.
    cmd(`git commit -m "Add ${NAME} to the team list"`),
    cmd(`git config --global user.name "${current.player.name}"`),
    cmd('git config --global user.email "ada@inkwell.example"'),
    cmd(`git commit -m "Add ${NAME} to the team list"`),
    ...CHAPTER_3_AFTER_COMMIT,
  ])
  runChapter('04-someone-else-changed-it', () => [
    { type: 'openChannel', channel: 'docs-team' },
    { type: 'openFile', path: 'team.md' },
    cmd('git pull'),
    { type: 'flackReply', messageId: 'sam-hello', replyId: 'welcome' },
  ])

  return { state, traces }
}

function startChapterAt(
  state: GameState,
  id: string
): [GameState, Parameters<typeof flushEffects>[2]] {
  const result = startChapter(config, state, id)
  return [result.state, result.effects]
}

describe('Chapter 0: Welcome', () => {
  it('walks through saying hello, opening GitNub and trying the terminal', () => {
    const { trace, state } = playChapter(config, '00-welcome', CHAPTER_0)
    expect(trace).toEqual(['say-hello', 'open-gitnub', 'try-help'])
    expect(state.story.phase).toBe('complete')
    expect(state.ui.unlockedTabs).toContain('gitnub')
    expect(state.flack.messages.map((message) => message.id)).toContain('welcome-task')
  })

  it('starts with only Flack unlocked', () => {
    const { state } = playChapter(config, '00-welcome', [])
    expect(state.ui.unlockedTabs).toEqual(['flack'])
    expect(state.flack.messages[0]).toMatchObject({ from: 'jordan', channel: 'docs-team' })
  })
})

describe('Chapter 1: Get the repo', () => {
  it('clones the repo and moves into it', () => {
    const { trace, state } = playChapter(config, '01-clone', CHAPTER_1)
    expect(trace).toEqual(['open-repo', 'copy-url', 'clone', 'ls', 'cd', 'look-around'])
    expect(state.git.local?.dir).toBe('docs-site')
    expect(state.shell.cwd).toBe('/Users/you/docs-site')
    expect(state.ui.unlockedTabs).toContain('editor')
  })

  it('cloning a decoy repo does not count', () => {
    const { state } = playChapter(config, '01-clone', [
      { type: 'viewRepo', slug: DOCS_SITE },
      { type: 'copyCloneUrl', slug: DOCS_SITE },
      cmd('git clone https://gitnub.com/inkwell/website.git'),
    ])
    expect(state.git.local).toBeUndefined()
    expect(state.story.completedSteps).toEqual(['open-repo', 'copy-url'])
  })
})

describe('Chapter 2: Sign the list', () => {
  const start = () => playChapter(config, '02-sign-the-list', []).state

  it('captures the name from the line the learner added', () => {
    const state = start()
    const { trace, state: after } = playChapter(
      config,
      '02-sign-the-list',
      [
        { type: 'openFile', path: 'team.md' },
        signTheList(state),
        cmd('git status'),
        cmd('git diff'),
      ],
      { from: state }
    )
    expect(trace).toEqual(['open-team-md', 'add-name', 'status', 'diff'])
    expect(after.player.name).toBe(NAME)
    expect(after.git.local!.working['team.md']).toContain(`- ${NAME}`)
  })

  it('does not accept a save that drops someone else’s name, and Robin says so', () => {
    const state = start()
    const after = play(config, state, [
      { type: 'openFile', path: 'team.md' },
      { type: 'saveFile', path: 'team.md', content: '# Docs team\n\n- Ada Lovelace\n' },
    ])
    expect(after.story.completedSteps).toEqual(['open-team-md'])
    expect(after.player.name).toBeUndefined()
    expect(after.flack.messages.at(-1)?.text).toContain('disappeared')
  })

  it('does not accept several new lines at once', () => {
    const state = start()
    const current = state.git.local!.working['team.md']
    const after = play(config, state, [
      { type: 'openFile', path: 'team.md' },
      { type: 'saveFile', path: 'team.md', content: `${current}- Ada\n- Also Ada\n` },
    ])
    expect(after.story.completedSteps).toEqual(['open-team-md'])
    expect(after.flack.messages.at(-1)?.text).toContain('more than one new line')
  })
})

describe('Chapter 3: Save it to GitNub', () => {
  it('branches, commits, pushes, opens a pull request and squash-merges it', () => {
    const { traces, state } = playDayOne()
    expect(traces['03-pull-request']).toEqual([
      'branch',
      'add',
      'commit',
      'push',
      'open-pr',
      'merge',
      'delete-branch',
      'switch-main',
      'pull',
    ])

    const remote = state.git.remotes[DOCS_SITE]
    const pr = findPullRequest(remote, 4)!
    expect(pr).toMatchObject({ status: 'merged', branchDeleted: true, reviewState: 'approved' })
    expect(remote.branches['ada-team-list']).toBeUndefined()
  })

  it('the first commit fails until Git knows who you are, and Robin helps', () => {
    const { state: afterChapter2 } = playChapter(config, '02-sign-the-list', [])
    const signed = play(config, afterChapter2, [
      { type: 'openFile', path: 'team.md' },
      signTheList(afterChapter2),
    ])
    const chapter3 = flushEffects(config, ...startChapterAt(signed, '03-pull-request'))
    const stuck = play(config, chapter3, [
      cmd('git switch -c ada-team-list'),
      cmd('git add team.md'),
      cmd('git commit -m "Add Ada Lovelace to the team list"'),
    ])

    expect(stuck.story.completedSteps).toEqual(['branch', 'add'])
    expect(stuck.shell.output.map((line) => line.text)).toContain('Author identity unknown')
    const help = stuck.flack.messages.at(-1)!
    expect(help.from).toBe('robin')
    expect(help.text).toContain('git config --global user.name "Ada Lovelace"')

    const unstuck = play(config, stuck, [
      cmd('git config --global user.name "Ada Lovelace"'),
      cmd('git config --global user.email "ada@inkwell.example"'),
      cmd('git commit -m "Add Ada Lovelace to the team list"'),
    ])
    expect(unstuck.story.completedSteps).toContain('commit')
    // Robin only says it once.
    expect(
      unstuck.flack.messages.filter((m) => m.text.includes('classic first-commit'))
    ).toHaveLength(1)
  })

  it('squash-merging leaves one new commit on main, by the learner', () => {
    const { state } = playDayOne()
    const remote = state.git.remotes[DOCS_SITE]
    const history = log(remote.commits, remote.branches.main)
    const mine = history.find((commit) => commit.message.startsWith(`Add ${NAME}`))!
    expect(mine.message).toBe(`Add ${NAME} to the team list (#4)\n\n* Add ${NAME} to the team list`)
    expect(mine.author.name).toBe(NAME)
    expect(mine.tree['team.md']).toContain(`- ${NAME}`)
  })
})

describe('Chapter 4: Someone else changed it', () => {
  it('Sam’s change arrives on GitNub, and git pull brings it down', () => {
    const { traces, state } = playDayOne()
    expect(traces['04-someone-else-changed-it']).toEqual([
      'read-sam',
      'look-at-team',
      'pull',
      'reply-sam',
    ])
    expect(state.git.local!.working['team.md']).toContain('- Sam Rivera')
    expect(state.git.local!.working['team.md']).toContain(`- ${NAME}`)
    expect(state.git.local!.branches.main).toBe(state.git.remotes[DOCS_SITE].branches.main)
    expect(state.story.phase).toBe('complete')
  })

  it('finishes day one with the whole loop behind them', () => {
    const { state } = playDayOne()
    expect(state.story.completedChapters).toEqual([
      '00-welcome',
      '01-clone',
      '02-sign-the-list',
      '03-pull-request',
      '04-someone-else-changed-it',
    ])
  })
})

describe('Chapter 5: Look before you leap', () => {
  const CHAPTER_5: Action[] = [
    cmd('git fetch'),
    cmd('git status'),
    cmd('git log --oneline origin/main'),
    cmd('git merge origin/main'),
    { type: 'openFile', path: 'docs/welcome.md' },
  ]
  const afterDayOne = () => {
    const { state } = playDayOne()
    return flushEffects(config, ...startChapterAt(state, '05-look-before-you-leap'))
  }

  it('fetches, sees it is behind, reads the log and fast-forwards', () => {
    const { trace, state } = playChapter(config, '05-look-before-you-leap', CHAPTER_5, {
      from: playDayOne().state,
    })
    expect(trace).toEqual(['fetch', 'status', 'log', 'merge', 'look'])
    expect(state.story.phase).toBe('complete')
    const repo = state.git.local!
    expect(repo.branches.main).toBe(state.git.remotes[DOCS_SITE].branches.main)
    expect(repo.working['docs/welcome.md']).toContain('documentation')
    expect(repo.working['team.md']).toContain(`- ${NAME}`)
    // A fast-forward: no merge commit.
    expect(repo.commits[repo.branches.main].parents).toHaveLength(1)
    expect(state.flack.messages.map((message) => message.id)).toContain('alex-typo')
  })

  it('git status before fetching says “up to date”, and Robin explains why', () => {
    const state = play(config, afterDayOne(), [cmd('git status')])
    expect(state.story.completedSteps).toEqual([])
    expect(JSON.stringify(state.shell.output.slice(-6))).toContain(
      "Your branch is up to date with 'origin/main'."
    )
    expect(state.flack.messages.at(-1)).toMatchObject({ from: 'robin', channel: 'dm-robin' })
    expect(state.flack.messages.at(-1)?.text).toContain('memory')
  })

  it('status shows behind by one after the fetch', () => {
    const state = play(config, afterDayOne(), [cmd('git fetch'), cmd('git status')])
    expect(JSON.stringify(state.shell.output.slice(-6))).toContain(
      "Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded."
    )
    expect(state.story.completedSteps).toEqual(['fetch', 'status'])
  })

  it('git pull counts for the last step too — it is fetch and merge in one', () => {
    const state = play(config, afterDayOne(), [
      cmd('git fetch'),
      cmd('git status'),
      cmd('git log --oneline origin/main'),
      cmd('git pull'),
    ])
    expect(state.story.completedSteps).toEqual(['fetch', 'status', 'log', 'merge'])
  })

  it('git merge main gets a nudge towards origin/main', () => {
    const state = play(config, afterDayOne(), [
      cmd('git fetch'),
      cmd('git status'),
      cmd('git log --oneline origin/main'),
      cmd('git merge main'),
    ])
    expect(state.story.completedSteps).toEqual(['fetch', 'status', 'log'])
    expect(state.flack.messages.at(-1)?.text).toContain('origin/main')
  })

  it('can be started on its own, with a fresh clone', () => {
    const { trace } = playChapter(config, '05-look-before-you-leap', CHAPTER_5)
    expect(trace).toEqual(['fetch', 'status', 'log', 'merge', 'look'])
  })
})

describe('Chapter 6: Two PRs, one file', () => {
  const STYLE_GUIDE = 'docs/style-guide.md'
  const fixTypo = (state: GameState): Action => ({
    type: 'saveFile',
    path: STYLE_GUIDE,
    content: state.git.local!.working[STYLE_GUIDE].replace('recieve', 'receive'),
  })
  const UP_TO_THE_PR = (state: GameState): Action[] => [
    cmd('git switch -c ada-typo'),
    { type: 'openFile', path: STYLE_GUIDE },
    fixTypo(state),
    cmd(`git add ${STYLE_GUIDE}`),
    cmd('git commit -m "Fix a typo in the style guide"'),
    cmd('git push -u origin ada-typo'),
    { type: 'openPullRequest', slug: DOCS_SITE, branch: 'ada-typo', title: 'Fix a typo' },
  ]

  /** Days one and two up to the start of Chapter 6. */
  function start(): GameState {
    const afterFive = playChapter(
      config,
      '05-look-before-you-leap',
      [
        cmd('git fetch'),
        cmd('git status'),
        cmd('git log --oneline origin/main'),
        cmd('git merge origin/main'),
      ],
      { from: playDayOne().state }
    ).state
    return flushEffects(config, ...startChapterAt(afterFive, '06-update-branch'))
  }

  it('the PR goes out of date, Update branch rebases it onto Alex’s commit, and it merges', () => {
    const initial = start()
    const upToPr = play(config, initial, UP_TO_THE_PR(initial))
    const pr = findPullRequest(upToPr.git.remotes[DOCS_SITE], 7)!
    expect(pr.branch).toBe('ada-typo')
    expect(pr.status).toBe('needs-update')
    expect(upToPr.story.completedSteps).toEqual([
      'branch',
      'fix',
      'commit',
      'push',
      'open-pr',
      'out-of-date',
    ])
    expect(upToPr.flack.messages.at(-1)).toMatchObject({ from: 'robin', lab: 'out-of-date' })

    const updated = play(config, upToPr, [{ type: 'updateBranch', slug: DOCS_SITE, number: 7 }])
    const remote = updated.git.remotes[DOCS_SITE]
    const alex = remote.branches.main
    const [mine] = pullRequestCommits(remote, findPullRequest(remote, 7)!)
    // The PR's commit now sits on top of Alex's, and the banner is gone.
    expect(mine.parents).toEqual([alex])
    expect(remote.commits[alex].message).toBe('Add two team tips (#8)')
    expect(findPullRequest(remote, 7)!.status).toBe('open')
    expect(findPullRequest(remote, 7)!.reviewState).toBe('approved')

    const done = play(config, updated, [
      { type: 'mergePullRequest', slug: DOCS_SITE, number: 7 },
      cmd('git switch main'),
      cmd('git pull'),
    ])
    expect(done.story.completedSteps).toEqual([
      'branch',
      'fix',
      'commit',
      'push',
      'open-pr',
      'out-of-date',
      'update',
      'merge',
      'catch-up',
    ])
    expect(done.story.phase).toBe('complete')
    const guide = done.git.local!.working[STYLE_GUIDE]
    expect(guide).toContain('so readers receive it clearly')
    expect(guide).toContain('Ask for a review early')
    const main = done.git.remotes[DOCS_SITE].branches.main
    expect(done.git.remotes[DOCS_SITE].commits[main].parents).toEqual([alex])
  })

  it('GitNub will not merge while the branch is out of date', () => {
    const initial = start()
    const upToPr = play(config, initial, UP_TO_THE_PR(initial))
    const tried = play(config, upToPr, [{ type: 'mergePullRequest', slug: DOCS_SITE, number: 7 }])
    expect(findPullRequest(tried.git.remotes[DOCS_SITE], 7)!.status).toBe('needs-update')
    expect(tried.git.remotes[DOCS_SITE].branches.main).toBe(
      upToPr.git.remotes[DOCS_SITE].branches.main
    )
  })

  it('git push --force gets a friendly no, and changes nothing', () => {
    const initial = start()
    const upToPr = play(config, initial, UP_TO_THE_PR(initial))
    const forced = play(config, upToPr, [cmd('git push --force')])
    expect(JSON.stringify(forced.shell.output.slice(-4))).toContain('Flack won’t force-push')
    expect(forced.git).toEqual(upToPr.git)
    expect(forced.story.completedSteps).toEqual(upToPr.story.completedSteps)
  })

  it('can be started on its own', () => {
    const initial = flushEffects(config, ...startChapterAt(blankState(config), '06-update-branch'))
    const after = play(config, initial, UP_TO_THE_PR(initial))
    expect(after.story.completedSteps).toContain('out-of-date')
  })
})
