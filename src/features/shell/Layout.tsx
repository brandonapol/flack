import { UnsavedEditsDialog } from '../editor'
import { FlackNotifications } from '../flack'
import { Instructions } from '../instructions'
import { Terminal } from '../terminal'
import { DesktopTabs } from './DesktopTabs'
import styles from './Layout.module.css'
import { SmallScreenNotice } from './SmallScreenNotice'

export function Layout() {
  return (
    <>
      <SmallScreenNotice />
      <UnsavedEditsDialog />
      <FlackNotifications />
      <div className={styles.layout}>
        <aside className={styles.instructions} aria-label="Instructions">
          <Instructions />
        </aside>
        <main className={styles.desktop} aria-label="Desktop">
          <DesktopTabs />
        </main>
        <section className={styles.terminal} aria-label="Terminal">
          <Terminal />
        </section>
      </div>
    </>
  )
}
