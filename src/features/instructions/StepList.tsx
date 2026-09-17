import type { Step } from '../../engine/story/types'
import styles from './Instructions.module.css'

interface StepListProps {
  steps: Step[]
  stepIndex: number
  completed: string[]
  skipped: string[]
  interpolate: (text: string) => string
}

export function StepList({ steps, stepIndex, completed, skipped, interpolate }: StepListProps) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => {
        const done = completed.includes(step.id)
        const wasSkipped = skipped.includes(step.id)
        const current = index === stepIndex
        const state = done ? 'done' : wasSkipped ? 'skipped' : current ? 'current' : 'todo'
        return (
          <li
            key={step.id}
            className={styles.step}
            data-state={state}
            aria-current={current ? 'step' : undefined}
          >
            <span className={styles.stepMark} aria-hidden="true">
              {done ? '✔' : wasSkipped ? '–' : current ? '▶' : '○'}
            </span>
            <span className={styles.stepTitle}>
              {interpolate(step.title)}
              {step.optional && <span className={styles.optional}>optional</span>}
              <span className={styles.srOnly}>
                {done
                  ? ' (done)'
                  : wasSkipped
                    ? ' (skipped)'
                    : current
                      ? ' (current step)'
                      : ' (not started)'}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
