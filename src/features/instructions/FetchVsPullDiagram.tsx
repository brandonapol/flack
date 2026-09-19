import styles from './FetchVsPullDiagram.module.css'

type Commit = 'yesterday' | 'fix'

const LABEL: Record<Commit, string> = {
  yesterday: 'Yesterday’s docs',
  fix: 'Alex’s fix',
}

interface Ref {
  id: 'gitnub' | 'origin' | 'main'
  title: string
}

const REFS: Ref[] = [
  { id: 'gitnub', title: 'GitNub’s main' },
  { id: 'origin', title: 'origin/main' },
  { id: 'main', title: 'Your main' },
]

interface Stage {
  label: string
  description: string
  commits: Record<Ref['id'], Commit>
  /** The ref this stage just moved, if any — highlighted in the diagram. */
  moved?: Ref['id']
}

const STAGES: Stage[] = [
  {
    label: 'Before',
    description:
      'Alex merged a fix on GitNub. Your main and origin/main — your computer’s memory of GitNub — are both a day old.',
    commits: { gitnub: 'fix', origin: 'yesterday', main: 'yesterday' },
  },
  {
    label: 'After `git fetch`',
    description:
      '`git fetch` asks GitNub what’s new and updates origin/main to match. Your own main hasn’t moved.',
    commits: { gitnub: 'fix', origin: 'fix', main: 'yesterday' },
    moved: 'origin',
  },
  {
    label: 'After `git merge origin/main`',
    description:
      '`git merge origin/main` brings your main up to match origin/main. `git pull` does both steps — fetch, then merge — at once.',
    commits: { gitnub: 'fix', origin: 'fix', main: 'fix' },
    moved: 'main',
  },
]

/**
 * `git fetch` vs `git pull`, and what `origin/main` is: three snapshots of the same three refs
 * (GitNub's `main`, your computer's memory of it, and your own `main`), side by side.
 */
export function FetchVsPullDiagram() {
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.title}>Fetch, then merge — or pull, both at once</figcaption>
      <div className={styles.stages}>
        {STAGES.map((stage) => (
          <div key={stage.label} className={styles.stage}>
            <p className={styles.stageLabel}>{stage.label}</p>
            <ol className={styles.refs}>
              {REFS.map((ref) => (
                <li
                  key={ref.id}
                  className={
                    stage.moved === ref.id ? `${styles.ref} ${styles.moved}` : styles.ref
                  }
                >
                  <span className={styles.refTitle}>{ref.title}</span>
                  <span className={styles.refCommit}>{LABEL[stage.commits[ref.id]]}</span>
                </li>
              ))}
            </ol>
            <p className={styles.stageText}>{stage.description}</p>
          </div>
        ))}
      </div>
    </figure>
  )
}
