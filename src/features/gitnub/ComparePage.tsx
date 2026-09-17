import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { pullRequestCommits } from '../../engine/git/pullRequests'
import { useGame } from '../../store'
import { repoPath, subjectOf } from './data'
import styles from './GitNub.module.css'
import { NotFound } from './GitNub'
import { RepoHeader } from './RepoHeader'

/** The "open a pull request" form, reached from the Compare & pull request banner. */
export function ComparePage() {
  const { org, repo: name, branch } = useParams()
  const slug = `${org}/${name}`
  const repo = useGame((s) => s.game.git.remotes[slug])
  const dispatch = useGame((s) => s.dispatch)
  const navigate = useNavigate()
  const nextNumber = repo?.nextPullRequest

  const tip = repo && branch ? repo.branches[branch] : undefined
  const commits =
    repo && branch && tip
      ? pullRequestCommits(repo, {
          number: 0,
          branch,
          base: repo.defaultBranch,
          title: '',
          body: '',
          status: 'open',
          comments: [],
          openedAt: 0,
        })
      : []
  const [title, setTitle] = useState(() =>
    commits.length > 0 ? subjectOf(commits[commits.length - 1].message) : (branch ?? '')
  )
  const [body, setBody] = useState('')

  if (!repo || !branch || !tip) return <NotFound />

  return (
    <div>
      <RepoHeader repo={repo} active="pulls" />
      <h2 className={styles.sectionTitle}>Open a pull request</h2>
      <p className={styles.muted}>
        <code className={styles.branchChip}>{repo.defaultBranch}</code> ←{' '}
        <code className={styles.branchChip}>{branch}</code> · {commits.length}{' '}
        {commits.length === 1 ? 'commit' : 'commits'}
      </p>
      <form
        className={styles.prForm}
        onSubmit={(event) => {
          event.preventDefault()
          dispatch({ type: 'openPullRequest', slug, branch, title: title.trim() || branch, body })
          navigate(repoPath(slug, 'pull', String(nextNumber)))
        }}
      >
        <label className={styles.field}>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Description (optional)</span>
          <textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <button type="submit" className={styles.codeButton}>
          Create pull request
        </button>
      </form>
    </div>
  )
}
