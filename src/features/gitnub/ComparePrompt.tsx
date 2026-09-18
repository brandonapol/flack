import { Link } from 'react-router'

import { commitsAhead, openPullRequestFor } from '../../engine/git/pullRequests'
import type { RemoteRepo } from '../../engine/git/types'
import { repoPath } from './data'
import styles from './GitNub.module.css'

/**
 * GitNub's nudge after you push a branch, as GitLab shows it: the newest branch without a merge
 * request gets one of these. It's the bridge between the terminal and the review workflow.
 */
export function ComparePrompt({ repo }: { repo: RemoteRepo }) {
  const branch = Object.keys(repo.branches)
    .filter((name) => name !== repo.defaultBranch)
    .find(
      (name) =>
        !openPullRequestFor(repo, name) &&
        !repo.pullRequests.some((pr) => pr.branch === name) &&
        // A branch with nothing new on it has nothing to request.
        commitsAhead(repo, name, repo.defaultBranch) > 0
    )

  if (!branch) return null
  return (
    <div className={styles.comparePrompt}>
      <span>
        You pushed to <strong>{branch}</strong> just now
      </span>
      <Link className={styles.compareButton} to={repoPath(repo.slug, 'compare', branch)}>
        Create merge request
      </Link>
    </div>
  )
}
