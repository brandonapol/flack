/**
 * "Where are my changes?": the learner's work, counted at each place it can be — from a file on
 * screen to GitNub's `main`. Derived from the game state; nothing here is stored.
 */
import type { GameState } from './game'
import { pullRequestCommits, type PullRequestStatus } from './git/pullRequests'
import { reachable } from './git/repo'
import { getStatus } from './git/status'

export interface ChangesSummary {
  branch: string
  /** Files edited but not staged: unsaved in the Editor, or saved and not yet `git add`ed. */
  working: number
  staged: number
  /** Commits on this branch that GitNub doesn't have yet. */
  commits: number
  /** The branch is on GitNub but nobody has opened a pull request for it. */
  pushedWithoutPr: boolean
  pr?: {
    number: number
    status: PullRequestStatus
    approved: boolean
    /** Commits it carries (before merging) — they become one when it's squash-merged. */
    commits: number
    /** The status in plain words. */
    words: string
  }
  /** Commits on GitNub's `main` that this branch doesn't have. */
  behind: number
}

export const PR_WORDS: Record<PullRequestStatus, string> = {
  open: 'waiting for review',
  'needs-update': 'someone else got there first',
  'has-conflicts': 'two people changed the same spot',
  merged: 'merged',
  closed: 'closed',
}

export function summarizeChanges(state: GameState): ChangesSummary | undefined {
  const local = state.git.local
  if (!local) return undefined
  const remote = state.git.remotes[local.slug]
  const status = getStatus(local)

  const unsaved = Object.entries(state.editor.buffers).filter(
    ([path, text]) => local.working[path] !== text
  ).length
  const changedOnDisk = status.unstaged.length + status.untracked.length

  const upstream = local.upstreams[local.head]
  const tip = local.branches[local.head]
  const onGitNub = upstream ? local.remoteBranches[upstream] : local.remoteBranches.main
  const known = onGitNub ? reachable(local.commits, onGitNub) : new Set<string>()
  const commits = [...reachable(local.commits, tip)].filter((id) => !known.has(id)).length

  const prs = remote.pullRequests.filter((pr) => pr.branch === local.head)
  const pr = prs.at(-1)
  const mine = reachable(local.commits, tip)
  const behind = [...reachable(remote.commits, remote.branches[remote.defaultBranch])].filter(
    (id) => !mine.has(id)
  ).length

  return {
    branch: local.head,
    working: unsaved + changedOnDisk,
    staged: status.staged.length,
    commits,
    pushedWithoutPr: !pr && local.head !== 'main' && Boolean(remote.branches[local.head]),
    pr: pr && {
      number: pr.number,
      status: pr.status,
      approved: pr.reviewState === 'approved',
      commits: pr.status === 'merged' ? 1 : pullRequestCommits(remote, pr).length,
      words:
        pr.status === 'open' && pr.reviewState === 'approved'
          ? 'approved — ready to merge'
          : PR_WORDS[pr.status],
    },
    behind,
  }
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The whole picture in one sentence, for screen readers. */
export function describeChanges(summary: ChangesSummary): string {
  const parts = [
    `${count(summary.working, 'change')} in your working files`,
    `${count(summary.staged, 'change')} staged`,
    `${count(summary.commits, 'commit')} waiting to push`,
    summary.pr
      ? `pull request #${summary.pr.number} ${summary.pr.words}`
      : summary.pushedWithoutPr
        ? 'your branch is on GitNub with no pull request yet'
        : 'no pull request',
    summary.behind > 0
      ? `GitNub’s main has ${count(summary.behind, 'commit')} you don’t have yet`
      : 'you have everything on GitNub’s main',
  ]
  return `On ${summary.branch}: ${parts.join(', ')}.`
}
