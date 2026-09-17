import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { shortId } from '../../engine/git/hash'
import { log } from '../../engine/git/repo'
import { useGame } from '../../store'
import { Markdown } from '../shared/Markdown'
import markdownStyles from '../shared/markdown.module.css'
import { relativeTime } from '../shared/time'
import { CodeButton } from './CodeButton'
import { ComparePrompt } from './ComparePrompt'
import { lastCommitTouching, listDirectory, repoPath, subjectOf } from './data'
import styles from './GitNub.module.css'
import { NotFound } from './GitNub'
import { RepoHeader } from './RepoHeader'

/** `tree` is set on the `/tree/<branch>/<folder>` route; elsewhere `*` belongs to the parent route. */
export function RepoPage({ tree = false }: { tree?: boolean }) {
  const params = useParams()
  const { org, repo: name, branch: branchParam } = params
  const dir = tree ? (params['*'] ?? '').replace(/\/$/, '') : ''
  const slug = `${org}/${name}`
  const repo = useGame((s) => s.game.git.remotes[slug])
  const now = useGame((s) => s.game.clock)
  const characters = useGame((s) => s.config.characters)
  const dispatch = useGame((s) => s.dispatch)
  const navigate = useNavigate()

  useEffect(() => {
    if (repo) dispatch({ type: 'viewRepo', slug })
  }, [slug, Boolean(repo)]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!repo) return <NotFound />
  const branch = branchParam ?? repo.defaultBranch
  const tipId = repo.branches[branch]
  if (!tipId) return <NotFound />

  const tip = repo.commits[tipId]
  const entries = listDirectory(tip.tree, dir)
  if (!entries) return <NotFound />
  const commitCount = log(repo.commits, tipId).length
  const readmePath = dir ? `${dir}/README.md` : 'README.md'
  const readme = tip.tree[readmePath]
  const branches = Object.keys(repo.branches).sort((a, b) =>
    a === repo.defaultBranch ? -1 : b === repo.defaultBranch ? 1 : a.localeCompare(b)
  )
  const authorOf = (email: string) => Object.values(characters).find((c) => c.email === email)

  return (
    <div>
      <RepoHeader repo={repo} active="code" />
      <ComparePrompt repo={repo} />
      <div className={styles.toolbar}>
        <label className={styles.branchPicker}>
          <span aria-hidden="true">⎇</span>
          <span className={styles.srOnly}>Branch</span>
          <select
            value={branch}
            onChange={(event) =>
              navigate(
                event.target.value === repo.defaultBranch
                  ? repoPath(slug)
                  : repoPath(slug, 'tree', event.target.value)
              )
            }
          >
            {branches.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.muted}>
          {branches.length} {branches.length === 1 ? 'branch' : 'branches'}
        </span>
        {dir && (
          <span className={styles.crumbs}>
            <Link
              to={branch === repo.defaultBranch ? repoPath(slug) : repoPath(slug, 'tree', branch)}
            >
              {name}
            </Link>
            {dir.split('/').map((part, i, parts) => (
              <span key={i}>
                {' / '}
                {i === parts.length - 1 ? (
                  <strong>{part}</strong>
                ) : (
                  <Link to={repoPath(slug, 'tree', branch, ...parts.slice(0, i + 1))}>{part}</Link>
                )}
              </span>
            ))}
          </span>
        )}
        <span className={styles.spacer} />
        {!repo.archived && <CodeButton slug={slug} />}
      </div>

      <div className={styles.fileBox}>
        <div className={styles.latestCommit}>
          <span className={styles.commitAuthor}>{tip.author.name}</span>
          <span className={styles.commitMessage}>{subjectOf(tip.message)}</span>
          <span className={styles.spacer} />
          <code className={styles.commitId}>{shortId(tip.id)}</code>
          <span className={styles.muted}>· {relativeTime(tip.timestamp, now)}</span>
          <Link
            to={repoPath(slug, 'commits', branch === repo.defaultBranch ? '' : branch)}
            className={styles.commitCount}
          >
            <span aria-hidden="true">🕘 </span>
            {commitCount} {commitCount === 1 ? 'commit' : 'commits'}
          </Link>
        </div>
        <table className={styles.fileTable}>
          <caption className={styles.srOnly}>Files in {dir || name}</caption>
          <tbody>
            {entries.map((entry) => {
              const last = lastCommitTouching(repo, branch, entry.path)
              const character = last ? authorOf(last.author.email) : undefined
              return (
                <tr key={entry.path}>
                  <td className={styles.fileName}>
                    <span aria-hidden="true" className={styles.fileIcon}>
                      {entry.type === 'dir' ? '📁' : '📄'}
                    </span>
                    <Link
                      to={repoPath(
                        slug,
                        entry.type === 'dir' ? 'tree' : 'blob',
                        branch,
                        entry.path
                      )}
                    >
                      {entry.name}
                    </Link>
                  </td>
                  <td className={styles.fileCommit} title={character?.name}>
                    {last ? subjectOf(last.message) : ''}
                  </td>
                  <td className={styles.fileTime}>
                    {last ? relativeTime(last.timestamp, now) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {readme !== undefined && (
        <section className={styles.readme} aria-label="README">
          <h3 className={styles.readmeTitle}>README.md</h3>
          <Markdown source={readme} className={markdownStyles.markdown} />
        </section>
      )}
    </div>
  )
}
