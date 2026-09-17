import { useState } from 'react'

import { currentChapter } from '../../engine/story/runner'
import { useGame } from '../../store'
import styles from './Flack.module.css'

/**
 * The helper. Robin can't read free text, so the learner picks a question: the ones this chapter
 * expects, plus a few that are always useful.
 */
/** Shared empty array: selectors must return a stable value. */
const NONE: string[] = []

export function AskRobin() {
  const mentor = useGame((s) => s.config.mentor)
  const chapterQuestions = useGame((s) => currentChapter(s.config, s.game)?.mentorQuestions ?? NONE)
  const generalQuestions = useGame((s) => s.config.mentorGeneralQuestions ?? NONE)
  const dispatch = useGame((s) => s.dispatch)
  const [showAll, setShowAll] = useState(false)

  if (!mentor) return null
  const all = Object.keys(mentor.entries)
  const suggested = [...new Set([...chapterQuestions, ...generalQuestions])].filter(
    (id) => mentor.entries[id]
  )
  const questions = showAll ? all : suggested

  return (
    <div className={styles.askRobin}>
      <p className={styles.askTitle}>
        <span aria-hidden="true">💬 </span>Ask Robin
      </p>
      <ul className={styles.askList} aria-label="Questions you can ask Robin">
        {questions.map((id) => (
          <li key={id}>
            <button
              type="button"
              className={styles.askButton}
              onClick={() => dispatch({ type: 'askMentor', questionId: id })}
            >
              {mentor.entries[id].question}
            </button>
          </li>
        ))}
      </ul>
      {all.length > suggested.length && (
        <button type="button" className={styles.askMore} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer questions' : `Show all ${all.length} questions`}
        </button>
      )}
    </div>
  )
}
