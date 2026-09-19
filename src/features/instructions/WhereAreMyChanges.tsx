import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { describeChanges, summarizeChanges, type ChangesSummary } from '../../engine/changes'
import { useGame } from '../../store'
import { Markdown } from '../shared/Markdown'
import styles from './WhereAreMyChanges.module.css'

type Box = 'working' | 'staged' | 'commits' | 'pr' | 'main'

const BOXES: Array<{ id: Box; title: string; explain: string; next: string }> = [
  {
    id: 'working',
    title: 'Working files',
    explain:
      'Files you’ve changed. Saving puts them on your computer — Git hasn’t picked them up yet.',
    next: 'Next: `git add <file>`',
  },
  {
    id: 'staged',
    title: 'Staged',
    explain: 'Changes you’ve picked for your next commit.',
    next: 'Next: `git commit -m "What I changed"`',
  },
  {
    id: 'commits',
    title: 'My commits',
    explain: 'Saved in your history, but only on your computer.',
    next: 'Next: `git push` (the first time on a branch: `git push -u origin <branch>`)',
  },
  {
    id: 'pr',
    title: 'Open MR',
    explain: 'Your branch on GitNub, asking to join `main`.',
    next: 'Next: a review, then **Merge**. Needs a rebase? **Rebase**. Conflicts? Usually **Keep both**.',
  },
  {
    id: 'main',
    title: 'GitNub main',
    explain: 'The team’s shared history. Everything ends up here, one commit per merge request.',
    next: 'When it has commits you don’t: `git switch main`, then `git pull`.',
  },
]

function valueOf(box: Box, summary: ChangesSummary, finished: boolean): string {
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
  switch (box) {
    case 'working':
      return n(summary.working, 'change')
    case 'staged':
      return n(summary.staged, 'change')
    case 'commits':
      return n(summary.commits, 'to push', 'to push')
    case 'pr':
      return summary.pr
        ? `!${summary.pr.number} ${summary.pr.words}`
        : summary.pushedWithoutPr
          ? 'pushed — no merge request yet'
          : 'none'
    case 'main':
      if (summary.behind === 0) return 'up to date'
      return finished
        ? `${n(summary.behind, 'new commit')} · pull next time`
        : `${n(summary.behind, 'new commit')} for you`
  }
}

interface Move {
  id: number
  from: Box
  to: Box
  /** Several tokens that become one on the way: a squash merge. */
  tokens: number
}

const ORDER: Box[] = ['working', 'staged', 'commits', 'pr', 'main']

/** What moved between two summaries, as tokens travelling between boxes. */
function movesBetween(before: ChangesSummary, after: ChangesSummary): Array<Omit<Move, 'id'>> {
  const moves: Array<Omit<Move, 'id'>> = []
  if (before.branch !== after.branch) return moves
  if (after.staged > before.staged) moves.push({ from: 'working', to: 'staged', tokens: 1 })
  if (after.commits > before.commits && after.staged < before.staged) {
    moves.push({ from: 'staged', to: 'commits', tokens: 1 })
  }
  if (after.commits < before.commits && (after.pr || after.pushedWithoutPr)) {
    moves.push({ from: 'commits', to: 'pr', tokens: 1 })
  }
  if (after.pr?.status === 'merged' && before.pr && before.pr.status !== 'merged') {
    moves.push({ from: 'pr', to: 'main', tokens: Math.max(1, before.pr.commits) })
  }
  if (after.behind < before.behind) moves.push({ from: 'main', to: 'working', tokens: 1 })
  return moves
}

/**
 * The five places a change can be, from a file on screen to GitNub's `main`, with how many are
 * where right now. Click a box to see what it means and what moves changes on.
 *
 * `finished`: nothing required is left in the chapter. New commits on GitNub's `main` are then
 * something to pull when you next start work, not a step you've missed.
 *
 * `boxes`: which boxes to show, in `ORDER`. Before push and merge requests exist (Chapter 3's
 * first `git status`), only `working`/`staged`/`commits` apply — the other two would just read
 * "none" and add noise to a mental model that's still being introduced.
 */
export function WhereAreMyChanges({
  finished = false,
  boxes = ORDER,
}: {
  finished?: boolean
  boxes?: Box[]
}) {
  const game = useGame((s) => s.game)
  const summary = useMemo(() => summarizeChanges(game), [game])
  const [panelOpen, setPanelOpen] = useState(false)
  const [open, setOpen] = useState<Box>()
  const [moves, setMoves] = useState<Move[]>([])
  const previous = useRef<ChangesSummary | undefined>(summary)
  const nextId = useRef(1)

  useEffect(() => {
    const before = previous.current
    previous.current = summary
    if (!before || !summary) return
    const found = movesBetween(before, summary)
    if (found.length === 0) return
    const added = found.map((move) => ({ ...move, id: nextId.current++ }))
    // Tokens are decoration: add them after this render, and drop them once they've arrived —
    // even if something else has changed in the meantime.
    const start = setTimeout(() => {
      setMoves((current) => [...current, ...added])
      setTimeout(() => {
        setMoves((current) => current.filter((move) => !added.some((a) => a.id === move.id)))
      }, 1200)
    })
    return () => clearTimeout(start)
  }, [summary])

  if (!summary) return null

  const activeFlags: Record<Box, boolean> = {
    working: summary.working > 0,
    staged: summary.staged > 0,
    commits: summary.commits > 0,
    pr: Boolean(summary.pr || summary.pushedWithoutPr),
    main: summary.behind > 0 && !finished,
  }
  const shownBoxes = BOXES.filter((box) => boxes.includes(box.id))
  const anyActive = boxes.some((id) => activeFlags[id])

  return (
    <section className={styles.panel} aria-labelledby="where-title">
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen(!panelOpen)}
      >
        <span aria-hidden="true">{panelOpen ? '▾' : '▸'}</span>
        <span id="where-title" className={styles.title}>
          Where are my changes?
        </span>
        {!panelOpen && anyActive && (
          <span className={styles.dot} aria-hidden="true" data-testid="wamc-dot" />
        )}
      </button>
      <p className={styles.srOnly} aria-live="polite">
        {describeChanges(summary)}
      </p>
      {panelOpen && (
        <>
          <ol className={styles.boxes}>
            {shownBoxes.map((box, index) => {
              const value = valueOf(box.id, summary, finished)
              const active = activeFlags[box.id]
              return (
                <li key={box.id} className={styles.box} data-box={box.id}>
                  <button
                    type="button"
                    className={active ? `${styles.boxButton} ${styles.active}` : styles.boxButton}
                    aria-expanded={open === box.id}
                    onClick={() => setOpen(open === box.id ? undefined : box.id)}
                  >
                    <span className={styles.boxTitle}>{box.title}</span>
                    <span className={styles.boxValue}>{value}</span>
                  </button>
                  {open === box.id && (
                    <div className={styles.explain}>
                      <Markdown source={box.explain} />
                      <Markdown source={box.next} />
                    </div>
                  )}
                  {index < shownBoxes.length - 1 && (
                    <span className={styles.arrow} aria-hidden="true">
                      ↓
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          <div className={styles.tokens} aria-hidden="true">
            {moves.flatMap((move) =>
              Array.from({ length: move.tokens }, (_, i) => (
                <span
                  key={`${move.id}-${i}`}
                  className={styles.token}
                  data-from={move.from}
                  data-to={move.to}
                  style={
                    {
                      '--from': ORDER.indexOf(move.from),
                      '--to': ORDER.indexOf(move.to),
                      // Squash: tokens start side by side and meet in the middle.
                      '--spread': `${(i - (move.tokens - 1) / 2) * 14}px`,
                    } as CSSProperties
                  }
                />
              ))
            )}
          </div>
        </>
      )}
    </section>
  )
}
