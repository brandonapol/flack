import { useState } from 'react'

import styles from './Editor.module.css'
import type { TreeNode } from './buildTree'

interface FileTreeProps {
  nodes: TreeNode[]
  openPath?: string
  dirty: Set<string>
  onOpen: (path: string) => void
}

export function FileTree({ nodes, openPath, dirty, onOpen }: FileTreeProps) {
  return (
    <ul className={styles.tree} role="list">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          openPath={openPath}
          dirty={dirty}
          onOpen={onOpen}
          depth={0}
        />
      ))}
    </ul>
  )
}

function TreeItem({
  node,
  openPath,
  dirty,
  onOpen,
  depth,
}: Omit<FileTreeProps, 'nodes'> & { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const indent = { paddingLeft: `${8 + depth * 14}px` }

  if (node.type === 'dir') {
    return (
      <li>
        <button
          type="button"
          className={styles.treeRow}
          style={indent}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <span aria-hidden="true" className={styles.chevron}>
            {expanded ? '▾' : '▸'}
          </span>
          {node.name}
        </button>
        {expanded && (
          <ul role="list" className={styles.tree}>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                openPath={openPath}
                dirty={dirty}
                onOpen={onOpen}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const isDirty = dirty.has(node.path)
  return (
    <li>
      <button
        type="button"
        className={styles.treeRow}
        style={indent}
        aria-current={node.path === openPath ? 'true' : undefined}
        onClick={() => onOpen(node.path)}
      >
        <span aria-hidden="true" className={styles.fileIcon}>
          📄
        </span>
        <span className={styles.treeName}>{node.name}</span>
        {isDirty && (
          <span className={styles.dirtyDot} title="Unsaved changes">
            ●<span className={styles.srOnly}> (unsaved changes)</span>
          </span>
        )}
      </button>
    </li>
  )
}
