import { useEffect, useId, useRef, useState } from 'react'

import { remoteUrl } from '../../engine/git/repo'
import { useGame } from '../../store'
import styles from './GitNub.module.css'

export function CodeButton({ slug }: { slug: string }) {
  const dispatch = useGame((s) => s.dispatch)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const url = remoteUrl(slug)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      // No clipboard permission: select the text so ⌘C / Ctrl+C works.
      inputRef.current?.select()
    }
    dispatch({ type: 'copyCloneUrl', slug })
    setCopied(ok)
  }

  return (
    <div className={styles.codeWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.codeButton}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => {
          setOpen(!open)
          setCopied(false)
        }}
      >
        <span aria-hidden="true">{'<>'}</span> Code <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          id={popoverId}
          className={styles.codePopover}
          role="dialog"
          aria-label="Clone this repository"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        >
          <p className={styles.popoverTitle}>Clone</p>
          <p className={styles.popoverTab}>HTTPS</p>
          <div className={styles.urlRow}>
            <input
              ref={inputRef}
              className={styles.urlInput}
              value={url}
              readOnly
              aria-label="Clone address"
              onFocus={(event) => event.target.select()}
            />
            <button type="button" className={styles.copyButton} onClick={copy} autoFocus>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className={styles.popoverHint} aria-live="polite">
            {copied
              ? 'Now paste it into the terminal after git clone.'
              : 'Use this address with git clone in the terminal.'}
          </p>
        </div>
      )}
    </div>
  )
}
