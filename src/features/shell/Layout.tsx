import { CommitLab } from '../commit-lab'
import { UnsavedEditsDialog } from '../editor'
import { FlackNotifications } from '../flack'
import { Instructions } from '../instructions'
import { PanelBoundary } from '../shared/PanelBoundary'
import { Terminal } from '../terminal'
import { DesktopTabs } from './DesktopTabs'
import styles from './Layout.module.css'
import { SaveNotice } from './SaveNotice'
import { SmallScreenNotice } from './SmallScreenNotice'

export function Layout() {
  return (
    <>
      <SmallScreenNotice />
      <SaveNotice />
      <UnsavedEditsDialog />
      <FlackNotifications />
      <div className={styles.layout}>
        <aside className={styles.instructions} aria-label="Instructions">
          <PanelBoundary name="the instructions">
            <Instructions />
          </PanelBoundary>
        </aside>
        <main className={styles.desktop} aria-label="Desktop">
          <DesktopTabs />
          <PanelBoundary name="the Commit Lab">
            <CommitLab />
          </PanelBoundary>
        </main>
        <section className={styles.terminal} aria-label="Terminal">
          <PanelBoundary name="the terminal">
            <Terminal />
          </PanelBoundary>
        </section>
      </div>
    </>
  )
}
