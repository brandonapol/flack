/**
 * The labels on GitNub's merge request and conflict buttons. Hints, Robin and the cheat sheet name
 * these buttons, so the buttons read their labels from here and `content.test.ts` checks the
 * content against them.
 */
export const CONFLICT_CHOICE_LABELS = {
  ours: 'Keep mine',
  theirs: 'Keep theirs',
  both: 'Keep both',
} as const

export const COMMIT_RESOLUTION_LABEL = 'Commit to source branch'

/**
 * Real GitLab's names for the same buttons (and a couple of other tools'). Content may mention them
 * only while saying they're GitLab's, never as the button to click in Flack.
 */
export const OTHER_TOOLS_CONFLICT_LABELS = [
  'Use ours',
  'Use theirs',
  'Edit inline',
  'Mark as resolved',
  'Mark resolved',
  'Accept current',
  'Accept incoming',
]
