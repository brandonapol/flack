import {
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

import { locationFor, promptLine, windowTitle } from '../../engine/shell/prompt'
import { useGame } from '../../store'
import styles from './Terminal.module.css'
import { OutputLine } from './TerminalOutput'

/** How close to the bottom (px) still counts as "following along" for auto-scroll. */
const STICKY_THRESHOLD = 24

export function Terminal() {
  const output = useGame((s) => s.game.shell.output)
  const history = useGame((s) => s.game.shell.history)
  const location = useGame((s) => locationFor(s.game))
  const game = useGame((s) => s.game)
  const dispatch = useGame((s) => s.dispatch)

  const [input, setInput] = useState('')
  const [note, setNote] = useState<string>()
  /** Position while browsing history with ↑/↓; `history.length` means "the line being typed". */
  const [historyIndex, setHistoryIndex] = useState<number>()
  const [draft, setDraft] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (scroller && stickToBottom.current) scroller.scrollTop = scroller.scrollHeight
  }, [output])

  const run = (line: string) => {
    stickToBottom.current = true
    dispatch({ type: 'runCommand', line })
    setInput('')
    setHistoryIndex(undefined)
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const mod = event.metaKey || event.ctrlKey

    if (event.key === 'Enter') {
      event.preventDefault()
      setNote(undefined)
      run(input)
      return
    }

    if (
      (event.metaKey && event.key.toLowerCase() === 'k') ||
      (event.ctrlKey && event.key.toLowerCase() === 'l')
    ) {
      event.preventDefault()
      dispatch({ type: 'clearTerminal' })
      return
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'c') {
      // Let a real copy through when text is selected.
      if (window.getSelection()?.toString()) return
      event.preventDefault()
      dispatch({ type: 'cancelInput', text: input })
      setInput('')
      setHistoryIndex(undefined)
      return
    }

    if (event.key === 'ArrowUp' && !mod) {
      if (history.length === 0) return
      event.preventDefault()
      const current = historyIndex ?? history.length
      if (historyIndex === undefined) setDraft(input)
      const next = Math.max(0, current - 1)
      setHistoryIndex(next)
      setInput(history[next])
      return
    }

    if (event.key === 'ArrowDown' && !mod) {
      if (historyIndex === undefined) return
      event.preventDefault()
      const next = historyIndex + 1
      if (next >= history.length) {
        setHistoryIndex(undefined)
        setInput(draft)
      } else {
        setHistoryIndex(next)
        setInput(history[next])
      }
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
    if (lines.length <= 1) return
    event.preventDefault()
    setNote(
      `You pasted ${lines.length} lines. Only the first one was run; paste the rest one at a time.`
    )
    run(`${input}${lines[0]}`)
  }

  const onScroll = () => {
    const scroller = scrollRef.current
    if (!scroller) return
    stickToBottom.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= STICKY_THRESHOLD
  }

  const focusInput = (event: MouseEvent) => {
    // Don't steal focus while someone is selecting output to copy it.
    if (window.getSelection()?.toString()) return
    if (event.target instanceof HTMLElement && event.target.closest('a, button')) return
    inputRef.current?.focus()
  }

  return (
    <div className={styles.terminal} onClick={focusInput}>
      <div className={styles.titlebar} aria-hidden="true">
        <span className={styles.icon} />
        <span className={styles.title}>{windowTitle(game)}</span>
        <span className={styles.controls}>
          <span>–</span>
          <span>□</span>
          <span>×</span>
        </span>
      </div>
      <div className={styles.scroller} ref={scrollRef} onScroll={onScroll}>
        <div role="log" aria-live="polite" aria-label="Terminal output" className={styles.output}>
          {output.map((line, i) => (
            <OutputLine key={i} line={line} />
          ))}
        </div>
        <div className={styles.promptLine} aria-hidden="true">
          <OutputLine line={promptLine(game)} />
        </div>
        <form
          className={styles.inputRow}
          onSubmit={(event) => {
            event.preventDefault()
            run(input)
          }}
        >
          <label htmlFor="terminal-input" className={styles.prompt} aria-hidden="true">
            $
          </label>
          <input
            id="terminal-input"
            aria-label={`Terminal command, at ${location}`}
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setHistoryIndex(undefined)
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </form>
        {note && (
          <p className={styles.note} role="status">
            {note}
          </p>
        )}
      </div>
    </div>
  )
}
