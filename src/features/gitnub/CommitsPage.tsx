import { useParams } from 'react-router'

import { shortId } from '../../engine/git/hash'
import { log } from '../../engine/git/repo'
import { useGame } from '../../store'
import { Avatar } from '../shared/Avatar'
import { relativeTime } from '../shared/time'
import { commitsByDay, subjectOf } from './data'
import styles from './GitNub.module.css'
import { NotFound } from './GitNub'
import { RepoHeader } from './RepoHeader'

export function CommitsPage() {
  const { org, repo: name, branch: branchParam } = useParams()
  const slug = `${org}/${name}`
  const repo = useGame((s) => s.game.git.remotes[slug])
  const now = useGame((s) => s.game.clock)
  const characters = useGame((s) => s.config.characters)

  if (!repo) return <NotFound />
  const branch = branchParam ?? repo.defaultBranch
  if (!repo.branches[branch]) return <NotFound />
  const groups = commitsByDay(log(repo.commits, repo.branches[branch]))

  return (
    <div>
      <RepoHeader repo={repo} active="commits" />
      <h3 className={styles.sectionTitle}>
        Commits on <span className={styles.badgeBranch}>⎇ {branch}</span>
      </h3>
      {groups.map((group) => (
        <section
          key={group.day}
          className={styles.commitGroup}
          aria-label={`Commits on ${group.day}`}
        >
          <h4 className={styles.commitDay}>Commits on {group.day}</h4>
          <ol className={styles.commitList}>
            {group.commits.map((commit) => {
              const character = Object.values(characters).find(
                (c) => c.email === commit.author.email
              )
              return (
                <li key={commit.id} className={styles.commitRow}>
                  <div className={styles.commitMain}>
                    <p className={styles.commitSubject}>{subjectOf(commit.message)}</p>
                    <p className={styles.muted}>
                      <Avatar name={commit.author.name} character={character} size={18} />{' '}
                      <strong>{commit.author.name}</strong> committed{' '}
                      {relativeTime(commit.timestamp, now)}
                    </p>
                  </div>
                  <code className={styles.commitId}>{shortId(commit.id)}</code>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
