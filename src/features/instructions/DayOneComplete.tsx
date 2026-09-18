import { useState } from 'react'
import { Link } from 'react-router'

import { interpolate } from '../../engine/story/template'
import { useGame } from '../../store'
import styles from './Instructions.module.css'

const SHARE_MESSAGE =
  'I finished Flack’s “Day one” Git tutorial! 🎉 Branch, commit, push, pull request, squash-merge.'

/** The end of Day one: what they learned, the cheat sheet, and a way to tell someone. */
export function DayOneComplete() {
  const game = useGame((s) => s.game)
  const chapters = useGame((s) => s.config.chapters)
  const dispatch = useGame((s) => s.dispatch)
  const canContinue =
    game.story.phase === 'complete' &&
    chapters.some((chapter) => chapter.milestone === 'keeping-in-sync')
  const [copied, setCopied] = useState(false)

  const learned = chapters
    .filter((chapter) => chapter.milestone === 'day-one')
    .flatMap((chapter) => chapter.summary)

  return (
    <section className={styles.card} aria-label="Day one complete">
      <h2 className={styles.cardTitle}>Day one complete 🎉</h2>
      <p>
        You cloned a repository, made a change, and got it reviewed and merged — the same way the
        rest of the team does, every day.
      </p>

      <h3 className={styles.subTitle}>What you learned</h3>
      <ul className={styles.summary}>
        {learned.map((point) => (
          <li
            key={point}
            dangerouslySetInnerHTML={{ __html: inlineCode(interpolate(point, game)) }}
          />
        ))}
      </ul>

      <div className={styles.actions}>
        <Link className={styles.primary} to="/cheat-sheet">
          Open the cheat sheet
        </Link>
        <button
          type="button"
          className={styles.action}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(SHARE_MESSAGE)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'Copied!' : 'Copy a message to share'}
        </button>
      </div>

      {canContinue ? (
        <button
          type="button"
          className={`${styles.primary} ${styles.continue}`}
          onClick={() => dispatch({ type: 'continueStory' })}
        >
          Continue to Keeping in sync
        </button>
      ) : (
        <p className={styles.comingSoon}>
          <button type="button" className={styles.action} disabled>
            Continue to Keeping in sync
          </button>{' '}
          <span className={styles.muted}>— coming soon</span>
        </p>
      )}
    </section>
  )
}

/** The summaries are plain strings with `code` spans; nothing else needs rendering. */
function inlineCode(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}
