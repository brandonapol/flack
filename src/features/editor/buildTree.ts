export interface TreeNode {
  name: string
  /** Repo-relative path. */
  path: string
  type: 'dir' | 'file'
  children: TreeNode[]
}

/** Folders first, then files, each alphabetical, like most editors show them. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] }
  for (const path of paths) {
    const parts = path.split('/')
    let node = root
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1
      const childPath = parts.slice(0, i + 1).join('/')
      let child = node.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path: childPath, type: isFile ? 'file' : 'dir', children: [] }
        node.children.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) =>
        a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)
      )
      .map((node) => ({ ...node, children: sort(node.children) }))
  return sort(root.children)
}
