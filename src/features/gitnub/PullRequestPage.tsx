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
  const [confirming, setConfirming] = useState(false)
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
        {pr.title} <span className={styles.prNumber}>#{pr.number}</span>
      </h2>
      <p className={styles.prMeta}>
        <span className={merged ? styles.statusMerged : styles.statusOpen}>
          {merged ? '✔' : '⌥'} {statusLabel}
        </span>{' '}
        <strong>{author}</strong> wants to merge {commits.length}{' '}
        {commits.length === 1 ? 'commit' : 'commits'} into{' '}
        <code className={styles.branchChip}>{pr.base}</code> from{' '}
        <code className={styles.branchChip}>{pr.branch}</code>
        {pr.branchDeleted && <span className={styles.badge}>branch deleted</span>}
      </p>

      <div className={styles.prTabs} role="tablist" aria-label="Pull request">
        {(
          [
            ['conversation', 'Conversation'],
            ['commits', `Commits ${commits.length}`],
            ['files', `Files changed ${diffs.length}`],
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
              <Avatar name={author} size={22} square /> <strong>{author}</strong> opened this{' '}
              {relativeTime(pr.openedAt, now)}
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
                    <span className={styles.approved}>approved these changes</span>
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
                This branch is out of date with the base branch
              </p>
              <p className={styles.muted}>
                Someone else’s work landed on <code>{pr.base}</code> first. Updating replays your
                commits on top of it — that’s a <strong>rebase</strong>. Nothing is lost.
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
                Update branch
              </button>
            </div>
          )}

          {conflicted.length > 0 && (
            <div className={styles.prNotice} role="note">
              <p className={styles.prNoticeTitle}>
                This branch has conflicts that must be resolved
              </p>
              <p className={styles.muted}>
                Your branch and <code>{pr.base}</code> both changed the same lines. Nothing is
                broken and nothing is lost — someone just has to choose what to keep.
              </p>
              <ul className={styles.conflictFiles} aria-label="Conflicting files">
                {conflicted.map((file) => (
                  <li key={file.path}>
                    <code>{file.path}</code>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => dispatch({ type: 'openCommitLab', scenario: 'sandbox' })}
              >
                See what’s going on in the Commit Lab →
              </button>
            </div>
          )}
          {updated && !needsUpdate && !merged && (
            <div className={styles.prNotice} role="status">
              <p className={styles.prNoticeTitle}>Branch updated</p>
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
                  <span className={styles.statusMerged}>✔ Merged</span> as{' '}
                  <code>{pr.mergedCommit ? shortId(pr.mergedCommit) : ''}</code> — your change is on{' '}
                  <code>{pr.base}</code> now.
                </p>
                {!pr.branchDeleted && repo.branches[pr.branch] && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      dispatch({ type: 'deleteRemoteBranch', slug, branch: pr.branch })
                    }
                  >
                    Delete branch
                  </button>
                )}
                {pr.branchDeleted && (
                  <p className={styles.muted}>
                    Branch deleted. Back in the terminal, run <code>git switch {pr.base}</code> then{' '}
                    <code>git pull</code> to catch up.
                  </p>
                )}
              </>
            ) : (
              <>
                {conflicted.length > 0 ? (
                  <>
                    <p className={styles.mergeSummary}>
                      Merging is blocked until the conflicts are resolved.
                    </p>
                    <button type="button" className={styles.codeButton} disabled>
                      Squash and merge
                    </button>
                  </>
                ) : (
                  <>
                    <p className={styles.mergeSummary}>
                      {pr.reviewState === 'approved'
                        ? '✔ Changes approved. This branch has no conflicts with the base branch.'
                        : 'Waiting for a review. You can still merge when you’re ready.'}
                    </p>
                    {confirming ? (
                      <div className={styles.mergeConfirm}>
                        <p className={styles.muted}>
                          Your {commits.length} {commits.length === 1 ? 'commit' : 'commits'} will
                          become 1 commit on <code>{pr.base}</code>:
                        </p>
                        <pre className={styles.mergePreview}>{squashMessage(pr, commits)}</pre>
                        <button
                          type="button"
                          className={styles.codeButton}
                          onClick={() => {
                            setConfirming(false)
                            dispatch({ type: 'mergePullRequest', slug, number: pr.number })
                          }}
                        >
                          Confirm squash and merge
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setConfirming(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.codeButton}
                        onClick={() => setConfirming(true)}
                      >
                        Squash and merge
                      </button>
                    )}
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
        <Link to={repoPath(slug, 'pulls')}>← All pull requests</Link>
      </p>
    </div>
  )
}
