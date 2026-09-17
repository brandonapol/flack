import styles from './SmallScreenNotice.module.css'

export function SmallScreenNotice() {
  return (
    <div className={styles.notice} role="note">
      <div className={styles.card}>
        <p className={styles.emoji} aria-hidden="true">
          💻
        </p>
        <h1>Flack works best on a laptop or desktop</h1>
        <p>
          It shows a chat app, a code host and a terminal side by side, which needs a screen at
          least 1100 pixels wide. Make this window wider, or come back on a bigger screen. Your
          progress is saved in this browser.
        </p>
      </div>
    </div>
  )
}
