import type { LabFigure } from '../../engine/story/types'
import styles from './CommitLab.module.css'
import { GraphView } from './GraphView'

/** Graphs side by side, as a still picture with a text description of each. */
export function LabFigureView({ figure }: { figure: LabFigure }) {
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figureTitle}>{figure.title}</figcaption>
      <div className={styles.panels}>
        {figure.panels.map((panel) => (
          <div key={panel.label} className={styles.panel}>
            <p className={styles.panelLabel}>{panel.label}</p>
            <div className={styles.panelGraph}>
              <GraphView
                graph={panel.graph}
                label={`${panel.label}: ${panel.description}`}
                compact
              />
            </div>
            <p className={styles.panelText}>{panel.description}</p>
          </div>
        ))}
      </div>
    </figure>
  )
}
