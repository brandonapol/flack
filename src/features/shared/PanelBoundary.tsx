import { Component, type ReactNode } from 'react'

import styles from './PanelBoundary.module.css'
import { isStaleBuildError } from './staleBuild'

interface Props {
  /** What broke, for the message: "the editor", "the terminal"… */
  name: string
  children: ReactNode
}

interface State {
  error?: unknown
}

/**
 * Keeps one panel's crash from blanking the whole page. The rest of the game keeps working, and
 * the learner gets a way out: try again, or reload for a newer version (progress is saved).
 */
export class PanelBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: unknown) {
    console.error(`Flack: ${this.props.name} crashed`, error)
  }

  render() {
    const { error } = this.state
    if (error === undefined) return this.props.children
    const stale = isStaleBuildError(error)
    return (
      <div className={styles.fallback} role="alert">
        <p className={styles.title}>
          {stale ? 'Flack has been updated' : `Something went wrong in ${this.props.name}`}
        </p>
        <p className={styles.body}>
          {stale
            ? `A newer version came out while this page was open, so ${this.props.name} can’t load. Reload to get it — your progress is saved.`
            : 'Your progress is saved, and nothing you did caused this. Try again, or reload the page.'}
        </p>
        <div className={styles.actions}>
          {!stale && (
            <button
              type="button"
              className={styles.button}
              onClick={() => this.setState({ error: undefined })}
            >
              Try again
            </button>
          )}
          <button
            type="button"
            className={stale ? styles.button : styles.secondary}
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
