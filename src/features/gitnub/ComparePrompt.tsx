import { Link } from 'react-router'

import { openPullRequestFor } from '../../engine/git/pullRequests'
import type { RemoteRepo } from '../../engine/git/types'
import { repoPath } from './data'
import styles from './GitNub.module.css'

/**
 * GitNub's nudge after you push a branch: the newest branch without a pull request gets one of
 * these. It's the bridge between the terminal and the review workflow.
 */
export function ComparePrompt({ repo }: { repo: RemoteRepo }) {
  const branch = Object.keys(repo.branches)
    .filter((name) => name !== repo.defaultBranch)
    .find(
      (name) =>
        !openPullRequestFor(repo, name) && !repo.pullRequests.some((pr) => pr.branch === name)
    )

  if (!branch) return null
  return (
    <div className={styles.comparePrompt}>
      <span>
        <strong>{branch}</strong> had recent pushes
      </span>
      <Link className={styles.compareButton} to={repoPath(repo.slug, 'compare', branch)}>
        Compare &amp; pull request
      </Link>
    </div>
  )
}
