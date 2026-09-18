import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import {
  shapeOf,
  type LabConflict,
  type LabGraph,
  type LabResult,
  type Resolution,
} from '../../engine/lab/graph'
import type { LabScenario } from '../../engine/story/types'
import { useGame } from '../../store'
import { Markdown } from '../shared/Markdown'
import { actionsFor, tipsOf, type LabAction } from './actions'
import styles from './CommitLab.module.css'
import { layout, laneY, MARGIN } from './layout'

/** The Commit Lab overlay, when something has opened it. */
export function CommitLab() {
  const open = useGame((s) => s.game.ui.commitLab)
  const scenario = useGame((s) => (open ? s.config.labScenarios?.[open.scenario] : undefined))
  if (!open || !scenario) return null
  // A fresh lab (and fresh undo history) for every scenario.
  return <Lab key={scenario.id} scenario={scenario} />
}

interface Pending {
  action: LabAction
  conflict: LabConflict
}

const DRAG_THRESHOLD = 4

function Lab({ scenario }: { scenario: LabScenario }) {
  const dispatch = useGame((s) => s.dispatch)
  const [history, setHistory] = useState<LabGraph[]>([scenario.start])
  const graph = history[history.length - 1]
  const [selected, setSelected] = useState<string>()
  const [target, setTarget] = useState<string>()
  const [pending, setPending] = useState<Pending>()
  const [caption, setCaption] = useState<string>()
  const [announcement, setAnnouncement] = useState('')
  const [resolved, setResolved] = useState<string>()
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number }>()
  const dragged = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)

  const guided = Boolean(scenario.target)
  const { placed, width, height } = layout(graph)
  const position = new Map(placed.map((p) => [p.node.id, p]))
  const actions =
    selected && target
      ? actionsFor(graph, selected, target, { squashLabel: scenario.squashLabel })
      : []

  useEffect(() => heading.current?.focus(), [])

  // Guided mode is done once the graph has the target's shape. Tell the story once.
  const done = Boolean(scenario.target && shapeOf(graph) === shapeOf(scenario.target))
  const completed = useRef(false)
  useEffect(() => {
    if (done && !completed.current) {
      completed.current = true
      dispatch({ type: 'completeCommitLab' })
    }
  }, [done, dispatch])

  const clearSelection = () => {
    setSelected(undefined)
    setTarget(undefined)
  }

  const apply = (result: LabResult, action: LabAction) => {
    if (result.ok) {
      setHistory((previous) => [...previous, result.graph])
      setCaption(result.caption)
      setAnnouncement(result.announcement)
      setResolved(result.resolved)
      setPending(undefined)
      clearSelection()
    } else if (result.kind === 'conflict') {
      setPending({ action, conflict: result.conflict })
      setAnnouncement('These two commits changed the same spot. Choose what to keep.')
    } else {
      setAnnouncement(result.reason)
    }
  }

  /** Click or Enter on a commit: pick it up, put it down, or drop it on another. */
  const choose = (id: string) => {
    if (pending) return
    if (!selected || selected === id) {
      setSelected(selected === id ? undefined : id)
      setTarget(undefined)
      setAnnouncement(selected === id ? 'Put down.' : 'Picked up. Now choose where it goes.')
      return
    }
    openMenu(selected, id)
  }

  /** `source` was dropped on `onto`: offer what can happen. */
  const openMenu = (source: string, onto: string) => {
    setSelected(source)
    setTarget(onto)
    const options = actionsFor(graph, source, onto, { squashLabel: scenario.squashLabel })
    setAnnouncement(
      options.length > 0
        ? `What should happen? ${options.map((option) => option.label).join(', ')}.`
        : 'Nothing to do there. Try another commit.'
    )
  }

  const onPointerDown = (event: ReactPointerEvent, id: string) => {
    if (pending) return
    dragged.current = false
    setDrag({ id, x0: event.clientX, y0: event.clientY, dx: 0, dy: 0 })
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag) return
    const dx = event.clientX - drag.x0
    const dy = event.clientY - drag.y0
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) dragged.current = true
    setDrag({ ...drag, dx, dy })
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    if (!drag) return
    const source = drag.id
    setDrag(undefined)
    if (!dragged.current) return
    const hit = document
      .elementFromPoint?.(event.clientX, event.clientY)
      ?.closest<SVGElement>('[data-node-id]')
    const dropped = hit?.dataset.nodeId
    if (!dropped || dropped === source) return
    openMenu(source, dropped)
  }

  const undo = () => {
    if (history.length < 2) return
    setHistory((previous) => previous.slice(0, -1))
    setCaption(undefined)
    setResolved(undefined)
    setPending(undefined)
    clearSelection()
    setAnnouncement('Undone.')
  }

  const reset = () => {
    setHistory([scenario.start])
    setCaption(undefined)
    setResolved(undefined)
    setPending(undefined)
    clearSelection()
    setAnnouncement('Back to the start.')
  }

  const close = () => dispatch({ type: 'closeCommitLab' })

  return (
    <div className={styles.overlay} role="dialog" aria-labelledby="commit-lab-title">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Commit Lab</p>
          <h2 id="commit-lab-title" className={styles.title} tabIndex={-1} ref={heading}>
            {scenario.title}
          </h2>
        </div>
        <button type="button" className={styles.close} onClick={close}>
          Close
        </button>
      </header>

      <div className={styles.intro}>
        <Markdown source={scenario.intro} />
        <p className={styles.how}>
          Drag a commit onto another — or select one with Enter, then another — and pick what should
          happen. Nothing here can go wrong: Undo and Reset are always there.
        </p>
      </div>

      <div className={styles.canvas}>
        <svg
          width={width}
          height={height}
          className={styles.graph}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setDrag(undefined)}
          aria-label="Commit graph"
          role="group"
        >
          {graph.lanes.map((lane) => (
            <g key={lane}>
              <line
                x1={MARGIN.left - 28}
                x2={width}
                y1={laneY(graph, lane)}
                y2={laneY(graph, lane)}
                className={styles.laneLine}
              />
              <text x={8} y={laneY(graph, lane) + 4} className={styles.laneLabel}>
                {lane}
              </text>
            </g>
          ))}

          {placed.flatMap(({ node, x, y }) =>
            node.parents.map((parent) => {
              const from = position.get(parent)
              if (!from) return null
              return (
                <line
                  key={`${parent}-${node.id}`}
                  x1={from.x}
                  y1={from.y}
                  x2={x}
                  y2={y}
                  className={styles.edge}
                />
              )
            })
          )}

          {placed.map(({ node, x, y }) => {
            const offset = drag?.id === node.id ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 }
            const tips = tipsOf(graph, node.id)
            const classes = [
              styles.node,
              node.copyOf ? styles.copy : '',
              node.lane === 'main' ? styles.main : '',
              selected === node.id ? styles.selected : '',
              target === node.id ? styles.target : '',
              drag?.id === node.id ? styles.dragging : '',
            ]
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                className={classes.filter(Boolean).join(' ')}
                style={{ transform: `translate(${x + offset.x}px, ${y + offset.y}px)` }}
                role="button"
                tabIndex={0}
                aria-pressed={selected === node.id}
                aria-label={[
                  node.label,
                  `by ${node.author}`,
                  `on ${node.lane}`,
                  node.copyOf ? 'a new copy' : '',
                  node.squashed ? `squashed from ${node.squashed.length} commits` : '',
                  tips.length > 0 ? `newest on ${tips.join(' and ')}` : '',
                ]
                  .filter(Boolean)
                  .join(', ')}
                onPointerDown={(event) => onPointerDown(event, node.id)}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false
                    return
                  }
                  choose(node.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    choose(node.id)
                  } else if (event.key === 'Escape') {
                    clearSelection()
                  }
                }}
              >
                <title>{node.squashed ? node.squashed.join('\n') : node.label}</title>
                <circle r={node.parents.length > 1 ? 16 : 14} />
                <text className={styles.initials} dy={4}>
                  {node.author.length <= 3 ? node.author : node.author.slice(0, 2)}
                </text>
                <text className={styles.label} dy={34}>
                  {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {selected && target && !pending && (
        <div className={styles.menu} role="group" aria-label="What should happen?">
          <p className={styles.menuTitle}>What should happen?</p>
          {actions.length === 0 ? (
            <p className={styles.muted}>Nothing to do there. Try another commit.</p>
          ) : (
            actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={styles.action}
                onClick={() => apply(action.run(), action)}
              >
                {action.label}
              </button>
            ))
          )}
          <button type="button" className={styles.secondary} onClick={clearSelection}>
            Cancel
          </button>
        </div>
      )}

      {pending && (
        <ConflictCallout
          conflict={pending.conflict}
          onChoose={(resolution) => apply(pending.action.run(resolution), pending.action)}
        />
      )}

      {caption && (
        <div className={styles.caption}>
          <p>{caption}</p>
          {resolved && (
            <>
              <p className={styles.muted}>The spot you chose for now reads:</p>
              <pre className={styles.snippet}>{resolved}</pre>
            </>
          )}
        </div>
      )}

      {done && (
        <div className={styles.done} role="status">
          <p>
            <strong>That’s the shape.</strong> You can keep playing, or close the lab.
          </p>
        </div>
      )}

      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.secondary}
          onClick={undo}
          disabled={history.length < 2}
        >
          Undo
        </button>
        <button type="button" className={styles.secondary} onClick={reset}>
          Reset
        </button>
        {!guided && (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              dispatch({ type: 'completeCommitLab' })
              close()
            }}
          >
            I get it
          </button>
        )}
      </footer>
    </div>
  )
}

function ConflictCallout({
  conflict,
  onChoose,
}: {
  conflict: LabConflict
  onChoose: (resolution: Resolution) => void
}) {
  const mine = conflict.mine.snippet ?? conflict.mine.label
  const theirs = conflict.theirs.snippet ?? conflict.theirs.label
  return (
    <div className={styles.conflict} role="alertdialog" aria-labelledby="lab-conflict-title">
      <p id="lab-conflict-title" className={styles.conflictTitle}>
        ⚠ These changed the same spot
      </p>
      <p className={styles.muted}>
        “{conflict.mine.label}” and “{conflict.theirs.label}” both changed the {conflict.touch}{' '}
        part. Nothing is broken — someone just has to choose.
      </p>
      <dl className={styles.sides}>
        <dt>Mine</dt>
        <dd>
          <code>{mine}</code>
        </dd>
        <dt>Theirs</dt>
        <dd>
          <code>{theirs}</code>
        </dd>
      </dl>
      <div className={styles.choices}>
        <button type="button" className={styles.action} onClick={() => onChoose('mine')}>
          Keep mine
        </button>
        <button type="button" className={styles.action} onClick={() => onChoose('theirs')}>
          Keep theirs
        </button>
        <button type="button" className={styles.action} onClick={() => onChoose('both')}>
          Keep both
        </button>
      </div>
      <p className={styles.markers}>
        In a real text editor you’d see this spot wrapped in{' '}
        <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code>{' '}
        markers. Here, you just pick.
      </p>
    </div>
  )
}
