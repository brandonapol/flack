import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'

interface CodeEditorProps {
  path: string
  value: string
  readOnly: boolean
  onChange: (value: string) => void
}

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '0.875rem' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0' },
  '.cm-gutters': {
    background: 'var(--chrome)',
    borderRight: '1px solid var(--border)',
    color: 'var(--text-muted)',
  },
  '&.cm-focused': { outline: 'none' },
})

export function CodeEditor({ path, value, readOnly, onChange }: CodeEditorProps) {
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      theme,
      EditorView.contentAttributes.of({ 'aria-label': `Editing ${path}` }),
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
    ],
    [path, readOnly]
  )
  return (
    <CodeMirror
      value={value}
      height="100%"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly, autocompletion: false }}
    />
  )
}
