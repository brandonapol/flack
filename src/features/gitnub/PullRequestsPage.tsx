import { Link, useParams } from 'react-router'

import { useGame } from '../../store'
import { relativeTime } from '../shared/time'
import { repoPath } from './data'
import styles from './GitNub.module.css'
import { NotFound } from './GitNub'
import { RepoHeader } from './RepoHeader'

export function PullRequestsPage() {
  const { org, repo: name } = useParams()
  const slug = `${org}/${name}`
  const repo = useGame((s) => s.game.git.remotes[slug])
  const now = useGame((s) => s.game.clock)
  if (!repo) return <NotFound />

  const open = repo.pullRequests.filter((pr) => pr.status !== 'merged' && pr.status !== 'closed')
  const closed = repo.pullRequests.filter((pr) => pr.status === 'merged' || pr.status === 'closed')

  return (
    <div>
      <RepoHeader repo={repo} active="pulls" />
      <h2 className={styles.sectionTitle}>
        Merge requests · {open.length} open · {closed.length} merged
      </h2>
      {repo.pullRequests.length === 0 ? (
        <p className={styles.muted}>No merge requests yet. Push a branch and you can create one.</p>
      ) : (
        <ul className={styles.commitList}>
          {[...open, ...closed].map((pr) => (
            <li key={pr.number} className={styles.commitRow}>
              <div className={styles.commitMain}>
                <p className={styles.commitSubject}>
                  <Link to={repoPath(slug, 'pull', String(pr.number))}>{pr.title}</Link>{' '}
                  <span className={styles.prNumber}>!{pr.number}</span>
                </p>
                <p className={styles.muted}>
                  {pr.status === 'merged' ? 'Merged' : 'Created'} {relativeTime(pr.openedAt, now)} ·{' '}
                  <code className={styles.branchChip}>{pr.branch}</code>
                </p>
              </div>
              <span className={pr.status === 'merged' ? styles.statusMerged : styles.statusOpen}>
                {pr.status === 'merged'
                  ? '✔ Merged'
                  : pr.status === 'needs-update'
                    ? 'Out of date'
                    : 'Open'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
