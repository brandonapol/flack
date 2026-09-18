import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { diffTreesDetailed } from '../../engine/git/diff'
import { shortId } from '../../engine/git/hash'
import {
  findPullRequest,
  mergeBase,
  pullRequestCommits,
  pullRequestConflicts,
  squashMessage,
} from '../../engine/git/pullRequests'
import { useGame } from '../../store'
import { Avatar } from '../shared/Avatar'
import { Markdown } from '../shared/Markdown'
import markdownStyles from '../shared/markdown.module.css'
import { relativeTime } from '../shared/time'
import { BranchGraph } from './BranchGraph'
import { ConflictResolver } from './ConflictResolver'
import { repoPath, subjectOf } from './data'
import { DiffView } from './DiffView'
import styles from './GitNub.module.css'
import { NotFound } from './GitNub'
import { RepoHeader } from './RepoHeader'

type Tab = 'conversation' | 'commits' | 'files'

export function PullRequestPage() {
  const { org, repo: name, number } = useParams()
  const slug = `${org}/${name}`
  const repo = useGame((s) => s.game.git.remotes[slug])
  const characters = useGame((s) => s.config.characters)
  const playerName = useGame((s) => s.game.player.name)
  const now = useGame((s) => s.game.clock)
  const dispatch = useGame((s) => s.dispatch)
  const [tab, setTab] = useState<Tab>('conversation')
  const [deleteSource, setDeleteSource] = useState(true)
  const [updated, setUpdated] = useState<{ from: string; to: string }>()

  if (!repo) return <NotFound />
  const pr = findPullRequest(repo, Number(number))
  if (!pr) return <NotFound />

  const commits = pullRequestCommits(repo, pr)
  const base = mergeBase(repo, pr)
  const baseTree = base ? repo.commits[base].tree : {}
  const branchTip = repo.branches[pr.branch]
  const diffs = branchTip ? diffTreesDetailed(baseTree, repo.commits[branchTip].tree) : []
  const author = playerName?.trim() || 'You'
  const merged = pr.status === 'merged'
  const needsUpdate = pr.status === 'needs-update'
  const conflicted = pr.status === 'has-conflicts' ? pullRequestConflicts(repo, pr) : []

  const statusLabel = merged ? 'Merged' : pr.status === 'closed' ? 'Closed' : 'Open'

  return (
    <div>
      <RepoHeader repo={repo} active="pulls" />

      <h2 className={styles.prTitle}>
        {pr.title} <span className={styles.prNumber}>!{pr.number}</span>
      </h2>
      <p className={styles.prMeta}>
        <span className={merged ? styles.statusMerged : styles.statusOpen}>
          {merged ? '✔' : '⌥'} {statusLabel}
        </span>{' '}
        <strong>{author}</strong> requested to merge{' '}
        <code className={styles.branchChip}>{pr.branch}</code> into{' '}
        <code className={styles.branchChip}>{pr.base}</code>
        {pr.branchDeleted && <span className={styles.badge}>source branch deleted</span>}
      </p>

      <div className={styles.prTabs} role="tablist" aria-label="Merge request">
        {(
          [
            ['conversation', 'Overview'],
            ['commits', `Commits ${commits.length}`],
            ['files', `Changes ${diffs.length}`],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={styles.prTab}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'conversation' && (
        <div className={styles.prBody}>
          <article className={styles.prComment}>
            <p className={styles.prCommentHeader}>
              <Avatar name={author} size={22} square /> <strong>{author}</strong> created this merge
              request {relativeTime(pr.openedAt, now)}
            </p>
            {pr.body ? (
              <Markdown source={pr.body} className={markdownStyles.markdown} />
            ) : (
              <p className={styles.muted}>No description provided.</p>
            )}
          </article>

          {pr.comments.map((comment, index) => {
            const character = characters[comment.author]
            return (
              <article key={index} className={styles.prComment}>
                <p className={styles.prCommentHeader}>
                  <Avatar
                    name={character?.name ?? comment.author}
                    character={character}
                    size={22}
                    square
                  />{' '}
                  <strong>{character?.name ?? comment.author}</strong>{' '}
                  {comment.kind === 'approval' ? (
                    <span className={styles.approved}>approved this merge request</span>
                  ) : (
                    'commented'
                  )}{' '}
                  {relativeTime(comment.timestamp, now)}
                </p>
                <Markdown source={comment.body} className={markdownStyles.markdown} />
              </article>
            )
          })}

          {needsUpdate && !merged && (
            <div className={styles.prNotice} role="note">
              <p className={styles.prNoticeTitle}>
                Merge blocked: the source branch must be rebased onto the target branch.
              </p>
              <p className={styles.muted}>
                Someone else’s work landed on <code>{pr.base}</code> first. <strong>Rebase</strong>{' '}
                replays your commits on top of it. Nothing is lost.
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  const before = repo.branches[pr.branch]
                  dispatch({ type: 'updateBranch', slug, number: pr.number })
                  setUpdated({ from: before, to: '' })
                }}
              >
                Rebase
              </button>
            </div>
          )}

          {conflicted.length > 0 && !merged && (
            <ConflictResolver slug={slug} pr={pr} conflicts={conflicted} />
          )}
          {pr.resolvedFrom && pr.status === 'open' && (
            <div className={styles.prNotice} role="status">
              <p className={styles.prNoticeTitle}>Conflicts resolved</p>
              <p className={styles.muted}>
                GitNub added a commit to your branch that merges <code>{pr.base}</code> in, with the
                choices you made. Changed your mind?
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => dispatch({ type: 'undoResolveConflicts', slug, number: pr.number })}
              >
                Undo and choose again
              </button>
            </div>
          )}
          {updated && !needsUpdate && !merged && (
            <div className={styles.prNotice} role="status">
              <p className={styles.prNoticeTitle}>Source branch rebased</p>
              <BranchGraph base={pr.base} branch={pr.branch} commits={commits.length} />
              <p className={styles.muted}>
                Your commits were replayed on top of <code>{pr.base}</code>. In the terminal this is{' '}
                <code>git rebase</code>.
              </p>
            </div>
          )}

          <div className={styles.mergeBox}>
            {merged ? (
              <>
                <p className={styles.mergedLine}>
                  <span className={styles.statusMerged}>✔ Merged</span> The changes were merged into{' '}
                  <code>{pr.base}</code> with{' '}
                  <code>{pr.mergedCommit ? shortId(pr.mergedCommit) : ''}</code>.
                </p>
                {!pr.branchDeleted && repo.branches[pr.branch] && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      dispatch({ type: 'deleteRemoteBranch', slug, branch: pr.branch })
                    }
                  >
                    Delete source branch
                  </button>
                )}
                {pr.branchDeleted && (
                  <p className={styles.muted}>
                    The source branch has been deleted. Back in the terminal, run{' '}
                    <code>git switch {pr.base}</code> then <code>git pull</code> to catch up.
                  </p>
                )}
              </>
            ) : (
              <>
                {conflicted.length > 0 || needsUpdate || commits.length === 0 ? (
                  <>
                    <p className={styles.mergeSummary}>
                      {commits.length === 0
                        ? 'Nothing to merge: the source branch has no commits the target branch doesn’t already have.'
                        : needsUpdate
                          ? 'Merge blocked: the source branch must be rebased onto the target branch.'
                          : 'Merge blocked: merge conflicts must be resolved.'}
                    </p>
                    <button type="button" className={styles.codeButton} disabled>
                      Merge
                    </button>
                  </>
                ) : (
                  <>
                    <p className={styles.mergeSummary}>
                      {pr.reviewState === 'approved'
                        ? '✔ Approved. Ready to merge!'
                        : 'Ready to merge! Approval is optional, but it’s worth waiting for a review.'}
                    </p>
                    <label className={styles.mergeOption}>
                      <input
                        type="checkbox"
                        checked={deleteSource}
                        onChange={(event) => setDeleteSource(event.target.checked)}
                      />{' '}
                      Delete source branch
                    </label>
                    <label className={styles.mergeOption}>
                      <input type="checkbox" checked disabled /> Squash commits{' '}
                      <span className={styles.muted}>(required on this project)</span>
                    </label>
                    <p className={styles.muted}>
                      {commits.length === 1
                        ? `1 commit will be added to ${pr.base}.`
                        : `${commits.length} commits will be squashed into 1 and added to ${pr.base}.`}
                    </p>
                    <details className={styles.mergePreviewBox}>
                      <summary>Squash commit message</summary>
                      <pre className={styles.mergePreview}>{squashMessage(slug, pr)}</pre>
                    </details>
                    <button
                      type="button"
                      className={styles.codeButton}
                      onClick={() => {
                        dispatch({ type: 'mergePullRequest', slug, number: pr.number })
                        if (deleteSource) {
                          dispatch({ type: 'deleteRemoteBranch', slug, branch: pr.branch })
                        }
                      }}
                    >
                      Merge
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'commits' && (
        <ol className={styles.commitList}>
          {commits.map((commit) => (
            <li key={commit.id} className={styles.commitRow}>
              <div className={styles.commitMain}>
                <p className={styles.commitSubject}>{subjectOf(commit.message)}</p>
                <p className={styles.muted}>
                  {commit.author.name} committed {relativeTime(commit.timestamp, now)}
                </p>
              </div>
              <code className={styles.commitId}>{shortId(commit.id)}</code>
            </li>
          ))}
        </ol>
      )}

      {tab === 'files' && <DiffView diffs={diffs} />}

      <p className={styles.backLink}>
        <Link to={repoPath(slug, 'pulls')}>← All merge requests</Link>
      </p>
    </div>
  )
}
