import { useEffect, useMemo, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router'

import { currentStep } from '../../engine/story/runner'
import { useGame } from '../../store'
import { CodeEditor } from './CodeEditor'
import styles from './Editor.module.css'
import { buildTree } from './buildTree'
import { FileTree } from './FileTree'

export default function Editor() {
  const local = useGame((s) => s.game.git.local)
  const openPath = useGame((s) => s.game.editor.openPath)
  const buffers = useGame((s) => s.game.editor.buffers)
  const step = useGame((s) => currentStep(s.config, s.game))
  const dispatch = useGame((s) => s.dispatch)
  const routePath = useParams()['*'] || undefined
  const navigate = useNavigate()

  const working = local?.working
  const exists = (path?: string) => Boolean(path && working && path in working)

  // Route → state: a link or the back button picked a file.
  useEffect(() => {
    if (routePath && routePath !== openPath && exists(routePath)) {
      dispatch({ type: 'openFile', path: routePath })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath])

  // State → route: the story or the terminal (`open team.md`) picked a file.
  useEffect(() => {
    if (openPath && openPath !== routePath && exists(openPath)) {
      navigate(`/editor/${openPath}`, { replace: !routePath })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPath])

  const tree = useMemo(() => buildTree(Object.keys(working ?? {})), [working])
  const dirty = useMemo(() => new Set(Object.keys(buffers)), [buffers])

  if (!local || !working) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No files yet</p>
        <p>Clone a repo first. Try the Terminal on the right.</p>
      </div>
    )
  }

  const path = exists(openPath) ? openPath : undefined
  const isDirty = path !== undefined && dirty.has(path)
  const saved = path ? working[path] : ''
  const value = path ? (buffers[path] ?? saved) : ''
  const readOnly = Boolean(path && step?.editableFiles && !step.editableFiles.includes(path))

  const save = () => {
    if (path && isDirty && !readOnly) dispatch({ type: 'saveFile', path, content: value })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      save()
    }
  }

  return (
    <div className={styles.editor} onKeyDown={onKeyDown}>
      <nav className={styles.sidebar} aria-label="Files">
        <div className={styles.sidebarTitle}>{local.dir}</div>
        <FileTree
          nodes={tree}
          openPath={path}
          dirty={dirty}
          onOpen={(p) => dispatch({ type: 'openFile', path: p })}
        />
      </nav>
      <section className={styles.main} aria-label={path ? `Editor: ${path}` : 'Editor'}>
        <header className={styles.toolbar}>
          <span className={styles.fileName}>
            {path ?? 'No file open'}
            {isDirty && (
              <span className={styles.dirtyDot} title="Unsaved changes">
                {' '}
                ●<span className={styles.srOnly}> (unsaved changes)</span>
              </span>
            )}
          </span>
          <span className={styles.branch} title="The branch you're editing on">
            <span aria-hidden="true">⎇ </span>
            <span className={styles.srOnly}>Branch: </span>
            {local.head}
          </span>
          <button
            type="button"
            className={styles.save}
            onClick={save}
            disabled={!isDirty || readOnly}
          >
            Save <kbd className={styles.kbd}>⌘S</kbd>
          </button>
        </header>
        {readOnly && (
          <p className={styles.readOnly} role="note">
            🔒 This file is read-only right now: you don’t need to change it for this step.
          </p>
        )}
        {path ? (
          <div className={styles.codeWrap}>
            <CodeEditor
              key={path}
              path={path}
              value={value}
              readOnly={readOnly}
              onChange={(content) => dispatch({ type: 'editBuffer', path, content })}
            />
          </div>
        ) : (
          <div className={styles.empty}>
            <p>Pick a file on the left to open it.</p>
          </div>
        )}
      </section>
    </div>
  )
}
