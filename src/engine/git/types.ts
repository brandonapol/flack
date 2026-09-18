import type { PullRequest } from './pullRequests'

/** path → file content. Paths are repo-relative with forward slashes: `docs/welcome.md`. */
export type FileTree = Record<string, string>

/** A 40-character fake hex id. Displayed shortened to 7. */
export type CommitId = string

export type CommitMap = Record<CommitId, Commit>

export interface Person {
  name: string
  email: string
}

export interface Commit {
  id: CommitId
  /** 0 for the first commit, 1 normally, 2 for a merge commit. */
  parents: CommitId[]
  /** First line is the subject; anything after a blank line is the body. */
  message: string
  author: Person
  /** Seconds since the epoch, from the game's fake clock. */
  timestamp: number
  /** Full snapshot. Files are tiny, so we never store deltas. */
  tree: FileTree
}

/** A repository as GitNub sees it. */
export interface RemoteRepo {
  slug: string
  description: string
  archived: boolean
  /** When set, `git clone` prints this instead of cloning (decoy repos). */
  cloneNote?: string
  commits: CommitMap
  branches: Record<string, CommitId>
  defaultBranch: string
  pullRequests: PullRequest[]
  /** The number the next pull request gets. */
  nextPullRequest: number
}

/** The learner's clone. */
export interface LocalRepo {
  slug: string
  /** Folder name inside `~`, e.g. `docs-site`. */
  dir: string
  commits: CommitMap
  /** Name of the checked-out branch. */
  head: string
  branches: Record<string, CommitId>
  /** Local branch → the remote branch it tracks (`main` → `main`, meaning `origin/main`). */
  upstreams: Record<string, string>
  /** Remote-tracking refs, keyed by remote branch name. Only clone/fetch/pull/push move these. */
  remoteBranches: Record<string, CommitId>
  /** Where `origin/HEAD` points. */
  remoteHead: string
  /** The staged snapshot. */
  index: FileTree
  /** Saved files, as the editor and `cat` see them. */
  working: FileTree
}

export interface GitConfig {
  userName?: string
  userEmail?: string
  /** `pull.rebase`: how `git pull` reconciles a diverged branch (true: rebase, false: merge). */
  pullRebase?: boolean
  /** `pull.ff only`: refuse anything but a fast-forward. */
  pullFf?: 'only'
}

export type ChangeKind = 'modified' | 'new' | 'deleted'

export interface Change {
  path: string
  kind: ChangeKind
}
