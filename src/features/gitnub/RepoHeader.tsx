import { Link } from 'react-router'

import type { RemoteRepo } from '../../engine/git/types'
import { repoPath } from './data'
import styles from './GitNub.module.css'

export function RepoHeader({
  repo,
  active,
}: {
  repo: RemoteRepo
  active: 'code' | 'commits' | 'pulls'
}) {
  const [org, name] = repo.slug.split('/')
  const openCount = repo.pullRequests.filter(
    (pr) => pr.status !== 'merged' && pr.status !== 'closed'
  ).length
  return (
    <>
      <div className={styles.repoTitle}>
        <span aria-hidden="true" className={styles.repoIcon}>
          ▤
        </span>
        <Link to="/gitnub">{org}</Link>
        <span className={styles.slash}>/</span>
        <Link to={repoPath(repo.slug)} className={styles.repoName}>
          {name}
        </Link>
        <span className={styles.badge}>{repo.archived ? 'Public archive' : 'Public'}</span>
      </div>
      <nav className={styles.repoTabs} aria-label="Repository">
        <Link to={repoPath(repo.slug)} aria-current={active === 'code' ? 'page' : undefined}>
          Code
        </Link>
        <Link
          to={repoPath(repo.slug, 'pulls')}
          aria-current={active === 'pulls' ? 'page' : undefined}
        >
          Pull requests
          {openCount > 0 && <span className={styles.tabCount}>{openCount}</span>}
        </Link>
        <Link
          to={repoPath(repo.slug, 'commits')}
          aria-current={active === 'commits' ? 'page' : undefined}
        >
          Commits
        </Link>
      </nav>
      {repo.archived && (
        <p className={styles.archivedBanner} role="note">
          This repository has been archived by the owner. It is now read-only.
        </p>
      )}
    </>
  )
}
