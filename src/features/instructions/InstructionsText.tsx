import { useEffect, useRef, useState } from 'react'

import { findGlossaryEntry, GLOSSARY, type GlossaryEntry } from '../../content/glossary'
import { DOCS } from '../../content/docsLinks'
import { renderMarkdown } from '../shared/renderMarkdown'
import styles from './Instructions.module.css'

/** Longest first, so "pull request" wins over "pull". */
const TERMS = [...GLOSSARY.flatMap((entry) => [entry.term, ...(entry.aliases ?? [])])].sort(
  (a, b) => b.length - a.length
)

const SKIP_TAGS = new Set(['CODE', 'PRE', 'A', 'BUTTON'])

/** Turns the first mention of each glossary term into a button that explains it. */
function linkGlossaryTerms(root: HTMLElement) {
  const used = new Set<string>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const queue: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (!node.parentElement || SKIP_TAGS.has(node.parentElement.tagName)) continue
    queue.push(node)
  }

  while (queue.length > 0) {
    const node = queue.shift()!
    for (const term of TERMS) {
      const entry = findGlossaryEntry(term)
      if (!entry || used.has(entry.id)) continue
      const match = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`, 'i').exec(
        node.data
      )
      if (!match) continue
      used.add(entry.id)
      const matched = node.splitText(match.index)
      const rest = matched.splitText(match[0].length)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.term
      button.dataset.term = entry.id
      button.textContent = matched.data
      matched.replaceWith(button)
      // Whatever follows the term may hold more terms.
      queue.unshift(rest)
      break
    }
  }
}

/**
 * Step text: Markdown, with inline `code` click-to-copy and the first mention of each glossary
 * term turned into a button that explains it.
 */
export function InstructionsText({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [entry, setEntry] = useState<GlossaryEntry>()
  const [copied, setCopied] = useState<string>()

  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.innerHTML = renderMarkdown(source)
    for (const code of root.querySelectorAll('code')) {
      if (code.closest('pre')) continue
      code.setAttribute('role', 'button')
      code.setAttribute('tabindex', '0')
      code.setAttribute('title', 'Click to copy')
      code.classList.add(styles.copyable)
    }
    linkGlossaryTerms(root)
    setEntry(undefined)
  }, [source])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Copying is a convenience; the text is right there either way.
    }
    setCopied(text)
    setTimeout(() => setCopied(undefined), 1500)
  }

  const onActivate = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return
    if (target.tagName === 'CODE') void copy(target.textContent ?? '')
    const termId = target.dataset.term
    if (termId) setEntry((current) => (current?.id === termId ? undefined : findEntryById(termId)))
  }

  return (
    <div className={styles.textWrapper}>
      <div
        ref={ref}
        className={styles.text}
        onClick={(event) => onActivate(event.target)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            if ((event.target as HTMLElement).tagName === 'CODE') event.preventDefault()
            onActivate(event.target)
          }
        }}
      />
      {copied && (
        <p className={styles.copied} role="status">
          Copied <code>{copied}</code>
        </p>
      )}
      {entry && (
        <div className={styles.glossaryCard} role="note">
          <p className={styles.glossaryTerm}>{entry.term}</p>
          <p className={styles.glossaryDefinition}>{entry.definition}</p>
          {entry.docs && (
            <a href={DOCS[entry.docs].href} target="_blank" rel="noreferrer">
              {DOCS[entry.docs].label} ↗
            </a>
          )}
          <button
            type="button"
            className={styles.glossaryClose}
            onClick={() => setEntry(undefined)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

function findEntryById(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((entry) => entry.id === id)
}
