import { useState } from 'react'
import { Link } from 'react-router'

import { DOCS } from '../../content/docsLinks'
import { useGame } from '../../store'
import { Markdown } from '../shared/Markdown'
import styles from './Instructions.module.css'

const SHARE_MESSAGE =
  'I finished Flack’s Git tutorial! 🎓 The daily loop, keeping a pull request in sync, squash, rebase — and conflicts don’t scare me any more.'

const NEXT = [DOCS.branching, DOCS.rebasing, DOCS.pullRequests, DOCS.mergeConflicts]

/** The end of Keeping in sync: the end of the game, for now. */
export function Graduation() {
  const chapters = useGame((s) => s.config.chapters)
  const game = useGame((s) => s.game)
  const dispatch = useGame((s) => s.dispatch)
  const bonus = chapters.find((chapter) => chapter.milestone === 'bonus')
  const [copied, setCopied] = useState(false)
  const learned = chapters
    .filter((chapter) => chapter.milestone === 'keeping-in-sync')
    .flatMap((chapter) => chapter.summary)

  return (
    <section className={styles.card} aria-label="You’ve graduated">
      <h2 className={styles.cardTitle}>You’ve graduated 🎓</h2>
      <p>
        {game.player.name ? `${game.player.name}, you` : 'You'} can keep a pull request in sync,
        tidy a history, and settle a conflict without breaking a sweat. That’s everything most
        writers ever need from Git.
      </p>

      <h3 className={styles.subTitle}>What you learned in Keeping in sync</h3>
      <ul className={styles.summary}>
        {learned.map((point) => (
          <li key={point}>
            <Markdown source={point} inline />
          </li>
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

      {bonus && game.story.phase === 'complete' && (
        <>
          <h3 className={styles.subTitle}>One more, if you like</h3>
          <p>
            <strong>{bonus.title}</strong> — a short bonus chapter on getting out of “I think I
            broke something”.
          </p>
          <button
            type="button"
            className={styles.action}
            onClick={() => dispatch({ type: 'continueStory' })}
          >
            Try the bonus chapter
          </button>
        </>
      )}

      <h3 className={styles.subTitle}>Where to go next</h3>
      <ul className={styles.summary}>
        {NEXT.map((link) => (
          <li key={link.href}>
            <a href={link.href} target="_blank" rel="noreferrer">
              {link.label} ↗
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
