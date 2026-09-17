import { diffLines, structuredPatch } from 'diff'

import { blobId } from './hash'
import { diffTrees } from './tree'
import type { ChangeKind, FileTree } from './types'

export interface DiffHunk {
  /** `@@ -4,3 +4,4 @@ Add your name to the bottom of the list to say hi!` */
  header: string
  /** Each line starts with ' ', '+', '-' or '\'. */
  lines: string[]
}

export interface FileDiff {
  path: string
  kind: ChangeKind
  oldBlob: string
  newBlob: string
  hunks: DiffHunk[]
}

function range(start: number, count: number): string {
  const from = count === 0 ? start - 1 : start
  return count === 1 ? `${from}` : `${from},${count}`
}

/**
 * Git's default hunk-header "function name": the nearest line above the hunk that starts with a
 * letter, `_` or `$`. For Markdown that's usually the closest heading or paragraph.
 */
function hunkContext(oldLines: string[], oldStart: number): string {
  for (let i = oldStart - 2; i >= 0; i--) {
    const candidate = oldLines[i]
    if (/^[A-Za-z_$]/.test(candidate)) return ` ${candidate.slice(0, 80).trimEnd()}`
  }
  return ''
}

export function diffFile(path: string, before?: string, after?: string): FileDiff | undefined {
  if (before === after) return undefined
  const kind: ChangeKind =
    before === undefined ? 'new' : after === undefined ? 'deleted' : 'modified'
  const patch = structuredPatch(path, path, before ?? '', after ?? '', '', '', { context: 3 })
  const oldLines = (before ?? '').split('\n')
  return {
    path,
    kind,
    oldBlob: blobId(before),
    newBlob: blobId(after),
    hunks: patch.hunks.map((hunk) => ({
      header: `@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@${hunkContext(oldLines, hunk.oldStart)}`,
      lines: hunk.lines,
    })),
  }
}

export function diffTreesDetailed(from: FileTree, to: FileTree): FileDiff[] {
  return diffTrees(from, to).flatMap((change) => {
    const diff = diffFile(change.path, from[change.path], to[change.path])
    return diff ? [diff] : []
  })
}

export interface FileStat {
  path: string
  kind: ChangeKind
  insertions: number
  deletions: number
}

function countLines(value: string): number {
  if (value === '') return 0
  return value.endsWith('\n') ? value.split('\n').length - 1 : value.split('\n').length
}

export function diffStat(from: FileTree, to: FileTree): FileStat[] {
  return diffTrees(from, to).map((change) => {
    let insertions = 0
    let deletions = 0
    for (const part of diffLines(from[change.path] ?? '', to[change.path] ?? '')) {
      if (part.added) insertions += countLines(part.value)
      else if (part.removed) deletions += countLines(part.value)
    }
    return { ...change, insertions, deletions }
  })
}
