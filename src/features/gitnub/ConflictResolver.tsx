import { useState } from 'react'

import {
  renderMarkers,
  resolveConflict,
  type ConflictChoice,
  type ConflictedFile,
} from '../../engine/git/merge'
import type { PullRequest } from '../../engine/git/pullRequests'
import { useGame } from '../../store'
import styles from './GitNub.module.css'

const CHOICES: Array<{ choice: ConflictChoice; label: string }> = [
  { choice: 'ours', label: 'Keep mine' },
  { choice: 'theirs', label: 'Keep theirs' },
  { choice: 'both', label: 'Keep both' },
]

/**
 * GitNub's conflict banner and resolver: for each file, pick mine, theirs or both, see what the
 * file will say, then mark it resolved. Nobody edits conflict markers by hand.
 */
export function ConflictResolver({
  slug,
  pr,
  conflicts,
}: {
  slug: string
  pr: PullRequest
  conflicts: ConflictedFile[]
}) {
  const dispatch = useGame((s) => s.dispatch)
  const hasLab = useGame((s) => Boolean(s.config.labScenarios?.['pr-conflict']))
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const ready = conflicts.every((file) => choices[file.path])

  return (
    <div className={styles.prNotice} role="note" aria-labelledby="conflict-title">
      <p id="conflict-title" className={styles.prNoticeTitle}>
        This branch has conflicts that must be resolved
      </p>
      <p className={styles.muted}>
        Your branch and <code>{pr.base}</code> both changed the same lines. Nothing is broken and
        nothing is lost — someone just has to choose what to keep.
      </p>
      <ul className={styles.conflictFiles} aria-label="Conflicting files">
        {conflicts.map((file) => (
          <li key={file.path}>
            <code>{file.path}</code>
          </li>
        ))}
      </ul>
      {hasLab && (
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => dispatch({ type: 'openCommitLab', scenario: 'pr-conflict' })}
        >
          See what’s conflicting →
        </button>
      )}

      {conflicts.map((file) => (
        <ConflictFile
          key={file.path}
          file={file}
          base={pr.base}
          branch={pr.branch}
          choice={choices[file.path]}
          onChoose={(choice) => setChoices((current) => ({ ...current, [file.path]: choice }))}
        />
      ))}

      <button
        type="button"
        className={styles.codeButton}
        disabled={!ready}
        onClick={() => dispatch({ type: 'resolveConflicts', slug, number: pr.number, choices })}
      >
        Mark as resolved
      </button>
    </div>
  )
}

function ConflictFile({
  file,
  base,
  branch,
  choice,
  onChoose,
}: {
  file: ConflictedFile
  base: string
  branch: string
  choice?: ConflictChoice
  onChoose: (choice: ConflictChoice) => void
}) {
  const heading = `conflict-${file.path.replace(/\W/g, '-')}`
  return (
    <section className={styles.conflictFile} aria-labelledby={heading}>
      <h3 id={heading} className={styles.conflictPath}>
        <code>{file.path}</code>
      </h3>
      {file.hunks.map((hunk, index) => (
        <div key={index} className={styles.conflictSides}>
          <div>
            <p className={styles.sideLabel}>Mine ({branch})</p>
            <pre className={styles.sideText}>{hunk.ours.join('\n') || '(deleted)'}</pre>
          </div>
          <div>
            <p className={styles.sideLabel}>Theirs ({base})</p>
            <pre className={styles.sideText}>{hunk.theirs.join('\n') || '(deleted)'}</pre>
          </div>
        </div>
      ))}

      <div className={styles.choiceRow} role="group" aria-label={`Resolve ${file.path}`}>
        {CHOICES.map((option) => (
          <button
            key={option.choice}
            type="button"
            className={styles.secondaryButton}
            aria-pressed={choice === option.choice}
            onClick={() => onChoose(option.choice)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {choice && <Preview file={file} base={base} choice={choice} />}

      <details className={styles.markers}>
        <summary>What would this look like in a text editor?</summary>
        <p className={styles.muted}>
          💡 You’d see <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> markers around the two versions —
          same idea, and you’d pick the same way.
        </p>
        <pre className={styles.sideText}>{renderMarkers(file, { ours: branch, theirs: base })}</pre>
      </details>
    </section>
  )
}

function Preview({
  file,
  base,
  choice,
}: {
  file: ConflictedFile
  base: string
  choice: ConflictChoice
}) {
  const kept = file.hunks.flatMap((hunk) =>
    choice === 'ours'
      ? hunk.ours
      : choice === 'theirs'
        ? hunk.theirs
        : [...hunk.ours, ...hunk.theirs]
  )
  const dropped = file.hunks.flatMap((hunk) =>
    choice === 'ours' ? hunk.theirs : choice === 'theirs' ? hunk.ours : []
  )
  const deletes = resolveConflict(file, choice) === undefined
  return (
    <div className={styles.preview} aria-live="polite">
      <p className={styles.sideLabel}>
        {deletes ? 'The file will be deleted.' : 'This part will read:'}
      </p>
      {!deletes && <pre className={styles.sideText}>{kept.join('\n')}</pre>}
      {dropped.length > 0 && (
        <p className={styles.nudge}>
          That drops {choice === 'ours' ? `what’s on ${base}` : 'your change'}:{' '}
          <code>{dropped.join(' ')}</code>. Want to keep both instead?
        </p>
      )}
      {choice === 'both' && (
        <p className={styles.muted}>Both stay, yours first. Check it still reads right.</p>
      )}
    </div>
  )
}
