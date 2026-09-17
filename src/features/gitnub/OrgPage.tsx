import { Link, useParams } from 'react-router'

import { useGame } from '../../store'
import { relativeTime } from '../shared/time'
import { repoPath } from './data'
import styles from './GitNub.module.css'
import { NotFound } from './GitNub'

export function OrgPage() {
  const org = useParams().org ?? 'inkwell'
  const remotes = useGame((s) => s.game.git.remotes)
  const now = useGame((s) => s.game.clock)
  const repos = Object.values(remotes)
    .filter((repo) => repo.slug.startsWith(`${org}/`))
    .map((repo) => {
      const tip = repo.commits[repo.branches[repo.defaultBranch]]
      return { repo, updated: tip.timestamp }
    })
    .sort((a, b) => Number(a.repo.archived) - Number(b.repo.archived) || b.updated - a.updated)

  if (repos.length === 0) return <NotFound />

  return (
    <div>
      <div className={styles.orgHeader}>
        <span aria-hidden="true" className={styles.orgAvatar}>
          I
        </span>
        <div>
          <h2 className={styles.orgName}>Inkwell</h2>
          <p className={styles.muted}>@{org} · Write, review and publish docs together</p>
        </div>
      </div>
      <h3 className={styles.sectionTitle}>Repositories</h3>
      <ul className={styles.repoList}>
        {repos.map(({ repo, updated }) => {
          const name = repo.slug.split('/')[1]
          return (
            <li key={repo.slug} className={styles.repoCard}>
              <div className={styles.repoCardTitle}>
                <Link to={repoPath(repo.slug)}>{name}</Link>
                <span className={styles.badge}>{repo.archived ? 'Public archive' : 'Public'}</span>
              </div>
              {repo.description && <p className={styles.muted}>{repo.description}</p>}
              <p className={styles.repoMeta}>
                <span className={styles.langDot} aria-hidden="true" /> Markdown ·{' '}
                {repo.archived ? 'Archived' : 'Updated'} {relativeTime(updated, now)}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
