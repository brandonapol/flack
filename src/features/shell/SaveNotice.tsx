import { useGame } from '../../store'
import styles from './SaveNotice.module.css'

/** Says so when a saved game couldn't be loaded (corrupt, or from an older version of Flack). */
export function SaveNotice() {
  const notice = useGame((s) => s.notice)
  const dismiss = useGame((s) => s.dismissNotice)
  if (notice !== 'save-discarded') return null

  return (
    <div className={styles.wrapper} role="status">
      <p className={styles.text}>
        Flack has changed since you last played, so your saved progress couldn’t be loaded. You’re
        starting again from the beginning.
      </p>
      <button type="button" className={styles.dismiss} onClick={dismiss}>
        OK
      </button>
    </div>
  )
}
