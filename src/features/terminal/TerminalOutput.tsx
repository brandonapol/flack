import { memo } from 'react'

import type { TerminalLine } from '../../engine/lines'
import styles from './Terminal.module.css'

const toneClass = (tone?: string) => (tone ? styles[`tone-${tone}`] : undefined)

export const OutputLine = memo(function OutputLine({ line }: { line: TerminalLine }) {
  if (line.spans) {
    return (
      <div className={styles.line}>
        {line.spans.map((span, i) => (
          <span key={i} className={toneClass(span.tone)}>
            {span.text}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className={[styles.line, toneClass(line.tone)].filter(Boolean).join(' ')}>
      {line.text || ' '}
    </div>
  )
})
