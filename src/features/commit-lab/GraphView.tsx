import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import type { LabGraph } from '../../engine/lab/graph'
import { describeNode } from './actions'
import styles from './CommitLab.module.css'
import { COMPACT, layout, laneY, SPACING } from './layout'

/** What the lab needs to make the graph draggable and selectable. */
export interface GraphInteraction {
  selected?: string
  target?: string
  drag?: { id: string; dx: number; dy: number }
  onPointerDown: (event: ReactPointerEvent, id: string) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
  onPointerLeave: () => void
  /** Click, Enter or Space on a commit. */
  onActivate: (id: string) => void
  onEscape: () => void
}

/**
 * A commit graph: one row per branch with `main` at the bottom, circles for commits, lines to
 * their parents. The Commit Lab makes it interactive; Instructions uses it as a still picture.
 */
export function GraphView({
  graph,
  label,
  interaction,
  compact = false,
}: {
  graph: LabGraph
  label: string
  interaction?: GraphInteraction
  /** Smaller, without commit labels: for still pictures. */
  compact?: boolean
}) {
  const spacing = compact ? COMPACT : SPACING
  const { placed, width, height } = layout(graph, spacing)
  const position = new Map(placed.map((p) => [p.node.id, p]))
  const i = interaction

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={compact ? `${styles.graph} ${styles.compact}` : styles.graph}
      onPointerMove={i?.onPointerMove}
      onPointerUp={i?.onPointerUp}
      onPointerLeave={i?.onPointerLeave}
      aria-label={label}
      role={i ? 'group' : 'img'}
    >
      {graph.lanes.map((lane) => (
        <g key={lane}>
          <line
            x1={spacing.left - 28}
            x2={width}
            y1={laneY(graph, lane, spacing)}
            y2={laneY(graph, lane, spacing)}
            className={styles.laneLine}
          />
          <text x={4} y={laneY(graph, lane, spacing) + 4} className={styles.laneLabel}>
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
        const offset = i?.drag?.id === node.id ? { x: i.drag.dx, y: i.drag.dy } : { x: 0, y: 0 }
        const classes = [
          styles.node,
          i ? styles.interactive : '',
          node.copyOf ? styles.copy : '',
          node.lane === 'main' ? styles.main : '',
          i?.selected === node.id ? styles.selected : '',
          i?.target === node.id ? styles.target : '',
          i?.drag?.id === node.id ? styles.dragging : '',
        ]
        return (
          <g
            key={node.id}
            data-node-id={node.id}
            className={classes.filter(Boolean).join(' ')}
            style={{ transform: `translate(${x + offset.x}px, ${y + offset.y}px)` }}
            {...(i
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-pressed': i.selected === node.id,
                  'aria-label': describeNode(graph, node),
                  onPointerDown: (event: ReactPointerEvent) => i.onPointerDown(event, node.id),
                  onClick: () => i.onActivate(node.id),
                  onKeyDown: (event: ReactKeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      i.onActivate(node.id)
                    } else if (event.key === 'Escape') {
                      i.onEscape()
                    }
                  },
                }
              : { 'aria-hidden': true })}
          >
            <title>{node.squashed ? node.squashed.join('\n') : node.label}</title>
            <circle r={(node.parents.length > 1 ? 16 : 14) * (compact ? 0.8 : 1)} />
            <text className={styles.initials} dy={compact ? 3 : 4}>
              {node.author.length <= 3 ? node.author : node.author.slice(0, 2)}
            </text>
            {!compact && (
              <text className={styles.label} dy={34}>
                {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
