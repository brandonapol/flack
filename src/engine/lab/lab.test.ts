import { describe, expect, it } from 'vitest'

import { blankState, reduce, startChapter, type GameState } from '../game'
import { toyConfig } from '../story/__fixtures__/toyChapter'
import type { Chapter, GameConfig } from '../story/types'
import { sandbox } from './__fixtures__/sandbox'
import { squash } from './graph'

const target = squash(sandbox(), ['y1', 'y2', 'y3'])
if (!target.ok) throw new Error()

const labChapter: Chapter = {
  id: 'lab',
  title: 'A tidier history',
  milestone: 'keeping-in-sync',
  intro: '',
  setup: (state) => state,
  steps: [
    {
      id: 'open',
      title: 'Open the lab',
      body: '',
      hints: [],
      goal: (_state, event) =>
        event.type === 'commitLabCompleted' && event.mode === 'guided' && event.chapterId === 'lab',
      onEnter: [{ type: 'openCommitLab', scenario: 'tidy' }],
    },
  ],
  mentorQuestions: [],
  summary: [],
}
const config: GameConfig = {
  ...toyConfig(),
  chapters: [labChapter],
  labScenarios: {
    tidy: { id: 'tidy', title: 'Tidy', intro: '', start: sandbox(), target: target.graph },
    play: { id: 'play', title: 'Play', intro: '', start: sandbox() },
  },
}

function started(): GameState {
  return startChapter(config, blankState(config), 'lab').state
}

describe('Commit Lab in the game', () => {
  it('a chapter can open it, and finishing it in guided mode completes the step', () => {
    const state = started()
    expect(state.ui.commitLab).toEqual({ scenario: 'tidy' })
    const done = reduce(config, state, { type: 'completeCommitLab' }).state
    expect(done.story.completedSteps).toEqual(['open'])
  })

  it('free mode reports itself as free, and closing leaves the story alone', () => {
    const opened = reduce(config, started(), { type: 'openCommitLab', scenario: 'play' }).state
    expect(opened.ui.commitLab).toEqual({ scenario: 'play' })
    const done = reduce(config, opened, { type: 'completeCommitLab' }).state
    expect(done.story.completedSteps).toEqual([])
    const closed = reduce(config, done, { type: 'closeCommitLab' }).state
    expect(closed.ui.commitLab).toBeUndefined()
  })

  it('ignores a scenario that does not exist', () => {
    const state = reduce(config, started(), { type: 'closeCommitLab' }).state
    expect(
      reduce(config, state, { type: 'openCommitLab', scenario: 'nope' }).state.ui.commitLab
    ).toBe(undefined)
  })
})
