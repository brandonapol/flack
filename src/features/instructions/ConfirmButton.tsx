import { useState } from 'react'

import styles from './Instructions.module.css'

interface ConfirmButtonProps {
  label: string
  question: string
  confirmLabel: string
  onConfirm: () => void
}

/** A footer action that asks once before doing something the learner can't undo. */
export function ConfirmButton({ label, question, confirmLabel, onConfirm }: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button type="button" className={styles.footerButton} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }

  return (
    <span className={styles.confirm} role="group" aria-label={question}>
      <span className={styles.confirmQuestion}>{question}</span>
      <button
        type="button"
        className={styles.confirmYes}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={styles.footerButton} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  )
}
