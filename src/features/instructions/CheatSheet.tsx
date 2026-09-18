import { Link } from 'react-router'

import { DOCS } from '../../content/docsLinks'
import { useGame } from '../../store'
import styles from './CheatSheet.module.css'
import { hasGraduated } from './progress'

interface Line {
  command: string
  what: string
  docs?: { label: string; href: string }
}

/** The loop, in the order you actually do it. */
const LOOP: Line[] = [
  {
    command: 'git switch main',
    what: 'Go back to the team’s shared branch.',
    docs: DOCS.gitSwitch,
  },
  {
    command: 'git pull',
    what: 'Get everything other people merged while you were away.',
    docs: DOCS.gitPull,
  },
  {
    command: 'git switch -c my-change',
    what: 'Start your own branch, named after what you’re doing.',
    docs: DOCS.gitSwitch,
  },
  {
    command: '(edit and save your files)',
    what: 'Saving changes the file on your computer. Nobody else sees it yet.',
  },
  { command: 'git status', what: 'See what you changed.', docs: DOCS.gitStatus },
  {
    command: 'git add my-file.md',
    what: 'Pick what goes into your next save point.',
    docs: DOCS.gitAdd,
  },
  {
    command: 'git commit -m "What I changed"',
    what: 'Make the save point, with a message.',
    docs: DOCS.gitCommit,
  },
  {
    command: 'git push -u origin my-change',
    what: 'Send your branch up to GitHub.',
    docs: DOCS.gitPush,
  },
  {
    command: 'Open the pull request',
    what: 'On the website: “Compare & pull request”, then “Create pull request”.',
    docs: DOCS.pullRequests,
  },
  {
    command: 'Squash and merge',
    what: 'After review. Your commits become one tidy commit on main.',
    docs: DOCS.squashMerge,
  },
  { command: 'Delete branch', what: 'Safe: your work is on main now.' },
  { command: 'git switch main', what: 'Back to the shared branch…' },
  { command: 'git pull', what: '…and bring your merged change down. Ready for the next one.' },
]

const ALSO: Array<{ title: string; body: string }> = [
  {
    title: 'A branch',
    body: 'Your own line of work. It shares the same folder — switching branches swaps what’s in it. Branch names can’t have spaces.',
  },
  {
    title: 'Squash',
    body: 'However many commits your branch has, squash-merging lands them on main as one. That’s why the history reads like a list of finished changes.',
  },
  {
    title: 'Update branch',
    body: 'If someone else’s work lands first, your pull request says it’s out of date. One button fixes it. That’s coming in the next module.',
  },
  {
    title: 'Conflicts',
    body: 'When two people change the same lines, someone has to choose. Nothing is broken and nothing is lost. Also next module.',
  },
]

/** Cheat sheet v2, once Keeping in sync is done: what to do when GitNub says… */
const WHEN_PR: Array<{ title: string; steps: string[]; docs: { label: string; href: string } }> = [
  {
    title: '…it’s out of date',
    steps: [
      'Nothing is wrong: someone else’s work landed on main first.',
      'Click **Update branch**. It rebases your commits onto the latest main.',
      'Then **Squash and merge** as usual.',
    ],
    docs: DOCS.updateBranch,
  },
  {
    title: '…it has conflicts',
    steps: [
      '**See what’s conflicting** (optional): you and someone else changed the same lines.',
      'Choose **Keep both** — or mine or theirs, if only one can stay.',
      '**Mark as resolved**, then merge. No markers to edit.',
    ],
    docs: DOCS.mergeConflicts,
  },
]

const NEXT = [DOCS.branching, DOCS.rebasing, DOCS.pullRequests, DOCS.mergeConflicts]

/** `**bold**` only: the cheat sheet's steps need nothing more. */
function bold(text: string) {
  return text
    .split(/\*\*([^*]+)\*\*/g)
    .map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))
}

export function CheatSheet() {
  const graduated = useGame((s) => hasGraduated(s.config, s.game))
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to="/flack">← Back to the game</Link>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <article className={styles.sheet}>
        <header>
          <h1 className={styles.title}>The daily loop</h1>
          <p className={styles.subtitle}>
            {graduated
              ? 'Flack cheat sheet · the loop you use every day, and what to do when GitNub says “wait”.'
              : 'Flack cheat sheet · everything you did on day one, in the order you do it.'}
          </p>
        </header>

        <ol className={styles.loop}>
          {LOOP.map((line) => (
            <li key={line.command + line.what}>
              <code className={styles.command}>{line.command}</code>
              <span className={styles.what}>
                {line.what}
                {line.docs && (
                  <a className={styles.docs} href={line.docs.href} target="_blank" rel="noreferrer">
                    docs ↗
                  </a>
                )}
              </span>
            </li>
          ))}
        </ol>

        {graduated ? (
          <>
            <section className={styles.also}>
              <h2 className={styles.alsoTitle}>When your pull request says…</h2>
              <div className={styles.alsoList}>
                {WHEN_PR.map((item) => (
                  <div key={item.title}>
                    <h3 className={styles.whenTitle}>{item.title}</h3>
                    <ol className={styles.whenSteps}>
                      {item.steps.map((step) => (
                        <li key={step}>{bold(step)}</li>
                      ))}
                    </ol>
                    <a
                      className={styles.docs}
                      href={item.docs.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      docs ↗
                    </a>
                  </div>
                ))}
              </div>
            </section>
            <section className={styles.next}>
              <h2 className={styles.alsoTitle}>Where to go next</h2>
              <ul>
                {NEXT.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <section className={styles.also}>
            <h2 className={styles.alsoTitle}>You’ll also hear about…</h2>
            <dl className={styles.alsoList}>
              {ALSO.map((item) => (
                <div key={item.title}>
                  <dt>{item.title}</dt>
                  <dd>{item.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <p className={styles.footer}>
          Stuck? Nothing you do with Git throws work away. Ask a teammate, and read the docs at
          git-scm.com.
        </p>
      </article>
    </div>
  )
}
