import { useEffect, useRef } from 'react'

import { useGame } from '../../store'
import { useRestoreFocus } from '../shared/useRestoreFocus'
import styles from './UnsavedEditsDialog.module.css'

/** Shown when a command was stopped because it would have replaced files with unsaved edits. */
export function UnsavedEditsDialog() {
  const blocked = useGame((s) => s.game.ui.unsavedBlock)
  const buffers = useGame((s) => s.game.editor.buffers)
  const dispatch = useGame((s) => s.dispatch)
  const dialogRef = useRef<HTMLDivElement>(null)

  useRestoreFocus(Boolean(blocked?.length))
  useEffect(() => {
    if (blocked) dialogRef.current?.querySelector('button')?.focus()
  }, [blocked])

  if (!blocked || blocked.length === 0) return null
  const files = blocked.join(', ')

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-body"
        className={styles.dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') dispatch({ type: 'dismissUnsavedBlock' })
        }}
      >
        <h2 id="unsaved-title">Save or discard your edits first</h2>
        <p id="unsaved-body">
          That command would replace <strong>{files}</strong>, and you have changes there you
          haven’t saved. Save them to keep them, or discard them. Then run the command again.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              for (const path of blocked) {
                const content = buffers[path]
                if (content !== undefined) dispatch({ type: 'saveFile', path, content })
              }
            }}
          >
            Save {blocked.length === 1 ? 'it' : 'them'}
          </button>
          <button
            type="button"
            onClick={() => blocked.forEach((path) => dispatch({ type: 'discardBuffer', path }))}
          >
            Discard my edits
          </button>
          <button type="button" onClick={() => dispatch({ type: 'dismissUnsavedBlock' })}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
