import styles from './GitNub.module.css'

/** A small before/after picture of what Update branch did to the commit graph. */
export function BranchGraph({
  base,
  branch,
  commits,
}: {
  base: string
  branch: string
  commits: number
}) {
  const dots = Math.min(commits, 3)
  return (
    <figure className={styles.graph}>
      <svg
        viewBox="0 0 300 92"
        role="img"
        width="300"
        height="92"
        aria-label={`Before: ${branch} started from an older commit on ${base}. After: your ${commits} commits sit on top of the latest ${base}.`}
      >
        <text x="0" y="12" className={styles.graphLabel}>
          Before
        </text>
        <line x1="40" y1="30" x2="150" y2="30" stroke="#adb5bd" strokeWidth="2" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={50 + i * 40} cy="30" r="6" fill="#adb5bd" />
        ))}
        <line x1="90" y1="30" x2="130" y2="14" stroke="#4c6ef5" strokeWidth="2" />
        {Array.from({ length: dots }, (_, i) => (
          <circle key={i} cx={130 + i * 26} cy="14" r="6" fill="#4c6ef5" />
        ))}
        <text x="0" y="74" className={styles.graphLabel}>
          After
        </text>
        <line x1="40" y1="74" x2="150" y2="74" stroke="#adb5bd" strokeWidth="2" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={50 + i * 40} cy="74" r="6" fill="#adb5bd" />
        ))}
        {Array.from({ length: dots }, (_, i) => (
          <circle key={i} cx={170 + i * 26} cy="74" r="6" fill="#4c6ef5" />
        ))}
        <line x1="130" y1="74" x2="224" y2="74" stroke="#4c6ef5" strokeWidth="2" />
      </svg>
      <figcaption className={styles.muted}>
        Grey: <code>{base}</code>. Blue: your commits on <code>{branch}</code>, now replayed on top.
      </figcaption>
    </figure>
  )
}
