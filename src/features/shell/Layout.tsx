import { DesktopTabs } from './DesktopTabs'
import styles from './Layout.module.css'
import { SmallScreenNotice } from './SmallScreenNotice'

export function Layout() {
  return (
    <>
      <SmallScreenNotice />
      <div className={styles.layout}>
        <aside className={styles.instructions} aria-label="Instructions">
          <p className={styles.placeholder}>Instructions</p>
        </aside>
        <main className={styles.desktop} aria-label="Desktop">
          <DesktopTabs />
        </main>
        <section className={styles.terminal} aria-label="Terminal">
          <p className={styles.placeholder}>Terminal</p>
        </section>
      </div>
    </>
  )
}
