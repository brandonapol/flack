import type { FileDiff } from '../../engine/git/diff'
import styles from './GitNub.module.css'

/** The "Files changed" view: one box per file, added lines green, removed lines red. */
export function DiffView({ diffs }: { diffs: FileDiff[] }) {
  if (diffs.length === 0) return <p className={styles.muted}>No changes.</p>
  return (
    <div>
      {diffs.map((diff) => (
        <div key={diff.path} className={styles.fileBox}>
          <p className={styles.diffHeader}>
            {diff.path}
            {diff.kind !== 'modified' && (
              <span className={styles.badge}>{diff.kind === 'new' ? 'added' : 'deleted'}</span>
            )}
          </p>
          <table className={styles.codeTable}>
            <caption className={styles.srOnly}>Changes to {diff.path}</caption>
            <tbody>
              {diff.hunks.map((hunk, hunkIndex) => (
                <tr key={hunkIndex}>
                  <td colSpan={2}>
                    <table className={styles.codeTable}>
                      <tbody>
                        <tr>
                          <td className={styles.hunkHeader} colSpan={2}>
                            {hunk.header}
                          </td>
                        </tr>
                        {hunk.lines.map((text, index) => (
                          <tr
                            key={index}
                            className={
                              text.startsWith('+')
                                ? styles.added
                                : text.startsWith('-')
                                  ? styles.removed
                                  : undefined
                            }
                          >
                            <td className={styles.lineNumber} aria-hidden="true">
                              {text.startsWith('+') ? '+' : text.startsWith('-') ? '−' : ' '}
                            </td>
                            <td className={styles.codeLine}>{text.slice(1) || ' '}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
