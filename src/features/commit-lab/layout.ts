import type { LabGraph, LabNode } from '../../engine/lab/graph'

export interface Spacing {
  column: number
  row: number
  left: number
  top: number
}

export const SPACING: Spacing = { column: 120, row: 96, left: 96, top: 36 }
/** For still pictures in the narrow Instructions column: no labels, tighter rows. */
export const COMPACT: Spacing = { column: 56, row: 52, left: 52, top: 22 }

export interface Placed {
  node: LabNode
  x: number
  y: number
}

/**
 * Left to right by how many commits come before (a merge sits right of both parents), one row
 * per branch with `main` at the bottom.
 */
export function layout(
  graph: LabGraph,
  spacing: Spacing = SPACING
): { placed: Placed[]; width: number; height: number } {
  const depth = new Map<string, number>()
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const depthOf = (id: string): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    const parents = byId.get(id)?.parents ?? []
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depthOf))
    depth.set(id, value)
    return value
  }
  const rows = graph.lanes.length
  const placed = graph.nodes.map((node) => {
    const lane = Math.max(0, graph.lanes.indexOf(node.lane))
    return {
      node,
      x: spacing.left + depthOf(node.id) * spacing.column,
      y: spacing.top + (rows - 1 - lane) * spacing.row,
    }
  })
  const columns = Math.max(0, ...placed.map((p) => depthOf(p.node.id))) + 1
  return {
    placed,
    width: spacing.left + columns * spacing.column,
    height: spacing.top * 2 + (rows - 1) * spacing.row + (spacing === SPACING ? 24 : 0),
  }
}

export function laneY(graph: LabGraph, lane: string, spacing: Spacing = SPACING): number {
  return spacing.top + (graph.lanes.length - 1 - graph.lanes.indexOf(lane)) * spacing.row
}

/** The commit nearest to a point in graph coordinates, if one is within `radius`. */
export function nearestNode(
  placed: Placed[],
  x: number,
  y: number,
  radius = 40
): string | undefined {
  let best: { id: string; distance: number } | undefined
  for (const p of placed) {
    const distance = Math.hypot(p.x - x, p.y - y)
    if (distance <= radius && (!best || distance < best.distance))
      best = { id: p.node.id, distance }
  }
  return best?.id
}
