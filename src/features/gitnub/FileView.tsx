import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useGame } from '../../store'
import { Markdown } from '../shared/Markdown'
import markdownStyles from '../shared/markdown.module.css'
import { relativeTime } from '../shared/time'
import { lastCommitTouching, repoPath, subjectOf } from './data'
import styles from './GitNub.module.css'
import { NotFound } from './GitNub'
import { RepoHeader } from './RepoHeader'

export function FileView() {
  const { org, repo: name, branch = 'main' } = useParams()
  const path = useParams()['*'] ?? ''
  const slug = `${org}/${name}`
  const repo = useGame((s) => s.game.git.remotes[slug])
  const now = useGame((s) => s.game.clock)
  const [raw, setRaw] = useState(false)

  if (!repo || !repo.branches[branch]) return <NotFound />
  const tip = repo.commits[repo.branches[branch]]
  const content = tip.tree[path]
  if (content === undefined) return <NotFound />

  const last = lastCommitTouching(repo, branch, path)
  const parts = path.split('/')
  const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n')
  const isMarkdown = path.endsWith('.md')
  const showRaw = raw || !isMarkdown

  return (
    <div>
      <RepoHeader repo={repo} active="code" />
      <p className={styles.crumbs}>
        <span className={styles.badgeBranch}>⎇ {branch}</span>{' '}
        <Link to={branch === repo.defaultBranch ? repoPath(slug) : repoPath(slug, 'tree', branch)}>
          {name}
        </Link>
        {parts.map((part, i) => (
          <span key={i}>
            {' / '}
            {i === parts.length - 1 ? (
              <strong>{part}</strong>
            ) : (
              <Link to={repoPath(slug, 'tree', branch, ...parts.slice(0, i + 1))}>{part}</Link>
            )}
          </span>
        ))}
      </p>
      <div className={styles.fileBox}>
        {last && (
          <div className={styles.latestCommit}>
            <span className={styles.commitAuthor}>{last.author.name}</span>
            <span className={styles.commitMessage}>{subjectOf(last.message)}</span>
            <span className={styles.spacer} />
            <span className={styles.muted}>{relativeTime(last.timestamp, now)}</span>
          </div>
        )}
        <div className={styles.fileToolbar}>
          {isMarkdown && (
            <div className={styles.segmented} role="group" aria-label="View as">
              <button type="button" aria-pressed={!showRaw} onClick={() => setRaw(false)}>
                Preview
              </button>
              <button type="button" aria-pressed={showRaw} onClick={() => setRaw(true)}>
                Code
              </button>
            </div>
          )}
          <span className={styles.muted}>
            {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {content.length} bytes
          </span>
        </div>
        {showRaw ? (
          <table className={styles.codeTable}>
            <caption className={styles.srOnly}>{path}</caption>
            <tbody>
              {lines.map((text, i) => (
                <tr key={i}>
                  <td className={styles.lineNumber}>{i + 1}</td>
                  <td className={styles.codeLine}>{text || ' '}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.preview}>
            <Markdown source={content} className={markdownStyles.markdown} />
          </div>
        )}
      </div>
    </div>
  )
}
