import type { ComponentType } from 'react'

import type { ConceptDiagramId } from '../../engine/story/types'
import { FetchVsPullDiagram } from './FetchVsPullDiagram'

/** Concept diagrams a step can point at with `conceptDiagram`, keyed by id. */
export const CONCEPT_DIAGRAMS: Record<ConceptDiagramId, ComponentType> = {
  'fetch-vs-pull': FetchVsPullDiagram,
}

export function ConceptDiagramView({ id }: { id: ConceptDiagramId }) {
  const Diagram = CONCEPT_DIAGRAMS[id]
  return <Diagram />
}
