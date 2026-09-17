import { Link, Route, Routes } from 'react-router'

import { CommitsPage } from './CommitsPage'
import { FileView } from './FileView'
import styles from './GitNub.module.css'
import { OrgPage } from './OrgPage'
import { RepoPage } from './RepoPage'

export function GitNub() {
  return (
    <div className={styles.gitnub}>
      <header className={styles.header}>
        <Link to="/gitnub" className={styles.logo} aria-label="GitNub home">
          <span aria-hidden="true" className={styles.logoMark} />
          GitNub
        </Link>
        <span className={styles.search} aria-hidden="true">
          Type <kbd>/</kbd> to search
        </span>
        <span className={styles.me} aria-hidden="true" />
      </header>
      <div className={styles.page}>
        <Routes>
          <Route index element={<OrgPage />} />
          <Route path=":org" element={<OrgPage />} />
          <Route path=":org/:repo" element={<RepoPage />} />
          <Route path=":org/:repo/tree/:branch/*" element={<RepoPage tree />} />
          <Route path=":org/:repo/blob/:branch/*" element={<FileView />} />
          <Route path=":org/:repo/commits" element={<CommitsPage />} />
          <Route path=":org/:repo/commits/:branch" element={<CommitsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  )
}

export function NotFound() {
  return (
    <div className={styles.notFound}>
      <h2>404: nothing here</h2>
      <p>
        This page doesn’t exist on GitNub.{' '}
        <Link to="/gitnub">Go back to the inkwell organization</Link>.
      </p>
    </div>
  )
}
