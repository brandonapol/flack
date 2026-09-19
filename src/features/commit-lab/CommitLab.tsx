import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { CONFLICT_CHOICE_LABELS } from '../../content/buttonLabels'
import {
  node,
  shapeOf,
  type LabConflict,
  type LabGraph,
  type LabResult,
  type Resolution,
} from '../../engine/lab/graph'
import type { LabScenario } from '../../engine/story/types'
import { useGame } from '../../store'
import { Markdown } from '../shared/Markdown'
import { useRestoreFocus } from '../shared/useRestoreFocus'
import { actionsFor, type LabAction } from './actions'
import styles from './CommitLab.module.css'
import { GraphView } from './GraphView'
import { layout, nearestNode } from './layout'

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

const DRAG_THRESHOLD = 8

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
  const [hint, setHint] = useState<string>()
  /** How each graph in `history` settled a conflict, if it did. */
  const [resolutions, setResolutions] = useState<Array<Resolution | undefined>>([undefined])
  const lastResolution = resolutions[resolutions.length - 1]
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number }>()
  const dragged = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)

  const guided = Boolean(scenario.target)
  const actions =
    selected && target
      ? actionsFor(graph, selected, target, { squashLabel: scenario.squashLabel })
      : []

  useRestoreFocus()
  useEffect(() => heading.current?.focus(), [])

  // Guided mode is done once the graph has a target's shape. Tell the story once.
  const done = Boolean(
    scenario.target &&
    [scenario.target].flat().some((target) => shapeOf(graph) === shapeOf(target)) &&
    (!scenario.avoid || lastResolution !== scenario.avoid)
  )
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

  const apply = (result: LabResult, action: LabAction, resolution?: Resolution) => {
    if (result.ok) {
      setHistory((previous) => [...previous, result.graph])
      setResolutions((previous) => [...previous, resolution])
      setCaption(result.caption)
      setAnnouncement(result.announcement)
      setResolved(result.resolved)
      setHint((resolution && scenario.resolutionHints?.[resolution]) ?? scenario.hints?.[action.id])
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
    // Swallow the click that may follow this drag, but no later one (Enter on a commit included).
    setTimeout(() => (dragged.current = false))
    const hit = document
      .elementFromPoint?.(event.clientX, event.clientY)
      ?.closest<SVGElement>('[data-node-id]')
    // Dropped near a commit rather than exactly on its circle still counts.
    const dropped = hit?.dataset.nodeId ?? nearestTo(event)
    if (!dropped || dropped === source) {
      // A wobbly click, not a drag: let the click that follows pick the commit up.
      dragged.current = false
      return
    }
    openMenu(source, dropped)
  }

  const nearestTo = (event: ReactPointerEvent) => {
    const svg = event.currentTarget as SVGSVGElement
    const box = svg.getBoundingClientRect()
    if (box.width === 0) return undefined
    const { placed, width } = layout(graph)
    const scale = width / box.width
    return nearestNode(
      placed,
      (event.clientX - box.left) * scale,
      (event.clientY - box.top) * scale
    )
  }

  const undo = () => {
    if (history.length < 2) return
    setHistory((previous) => previous.slice(0, -1))
    setResolutions((previous) => previous.slice(0, -1))
    setCaption(undefined)
    setResolved(undefined)
    setHint(undefined)
    setPending(undefined)
    clearSelection()
    setAnnouncement('Undone.')
  }

  const reset = () => {
    setHistory([scenario.start])
    setResolutions([undefined])
    setCaption(undefined)
    setResolved(undefined)
    setHint(undefined)
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
          Drag a commit onto another. Or click it (or press Enter) to pick it up, then click the
          commit where it should go. Click it again, or press Esc, to put it down. Nothing here can
          go wrong: Undo and Reset are always there.
        </p>
      </div>

      <div className={styles.canvas}>
        {selected && !target && !pending && (
          <p className={styles.picked}>
            Picked up <strong>“{node(graph, selected).label}”</strong> on{' '}
            {node(graph, selected).lane}. Now click the commit where it should go.
          </p>
        )}
        <GraphView
          graph={graph}
          label="Commit graph"
          interaction={{
            selected,
            target,
            drag,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerLeave: () => setDrag(undefined),
            onActivate: (id) => {
              if (dragged.current) {
                dragged.current = false
                return
              }
              choose(id)
            },
            onEscape: clearSelection,
          }}
        />
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
          onChoose={(resolution) =>
            apply(pending.action.run(resolution), pending.action, resolution)
          }
        />
      )}

      {caption && (
        <div className={styles.caption}>
          <p>{caption}</p>
          {hint && (
            <p className={styles.hint}>
              <Markdown source={hint} inline />
            </p>
          )}
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
          {CONFLICT_CHOICE_LABELS.ours}
        </button>
        <button type="button" className={styles.action} onClick={() => onChoose('theirs')}>
          {CONFLICT_CHOICE_LABELS.theirs}
        </button>
        <button type="button" className={styles.action} onClick={() => onChoose('both')}>
          {CONFLICT_CHOICE_LABELS.both}
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
