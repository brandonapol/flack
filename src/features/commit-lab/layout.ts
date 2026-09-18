import type { LabGraph, LabNode } from '../../engine/lab/graph'

export const COLUMN = 120
export const ROW = 96
export const MARGIN = { left: 96, top: 36 }

export interface Placed {
  node: LabNode
  x: number
  y: number
}

/**
 * Left to right by how many commits come before (a merge sits right of both parents), one row
 * per branch with `main` at the bottom.
 */
export function layout(graph: LabGraph): { placed: Placed[]; width: number; height: number } {
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
      x: MARGIN.left + depthOf(node.id) * COLUMN,
      y: MARGIN.top + (rows - 1 - lane) * ROW,
    }
  })
  const columns = Math.max(0, ...placed.map((p) => depthOf(p.node.id))) + 1
  return {
    placed,
    width: MARGIN.left + columns * COLUMN,
    height: MARGIN.top * 2 + (rows - 1) * ROW + 24,
  }
}

export function laneY(graph: LabGraph, lane: string): number {
  return MARGIN.top + (graph.lanes.length - 1 - graph.lanes.indexOf(lane)) * ROW
}
