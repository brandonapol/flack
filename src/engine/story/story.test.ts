import { describe, expect, it } from 'vitest'

import {
  blankState,
  initialState,
  reduce,
  startChapter,
  type Action,
  type GameState,
} from '../game'
import { toyConfig } from './__fixtures__/toyChapter'
import { flushEffects, play, playChapter } from './harness'
import { currentStep, shouldPulseHint } from './runner'
import { interpolate } from './template'

const config = toyConfig()
const cmd = (line: string): Action => ({ type: 'runCommand', line })
const save: Action = { type: 'saveFile', path: 'team.md', content: '# Docs team\n\n- Ada\n' }

function started(): GameState {
  const result = initialState(config)
  return flushEffects(config, result.state, result.effects)
}

describe('golden path', () => {
  it('the toy chapter completes every step in order', () => {
    const result = playChapter(config, 'toy', [
      cmd('echo hello'),
      { type: 'openFile', path: 'team.md' },
      save,
      { type: 'flackReply', messageId: 'sam-hi', replyId: 'wave' },
    ])
    expect(result.trace).toEqual(['say-hello', 'peek', 'save', 'reply'])
    expect(result.state.story.phase).toBe('complete')
    expect(result.state.story.completedChapters).toEqual(['toy'])
    expect(result.output.map((line) => line.text)).toContain('hello')
  })

  it('onEnter effects run when the chapter starts', () => {
    const state = started()
    expect(state.flack.messages.map((m) => m.id)).toEqual(['welcome'])
    expect(currentStep(config, state)?.id).toBe('say-hello')
  })
})

describe('misses and hints', () => {
  it('a wrong command does not advance and counts a miss', () => {
    const state = play(config, started(), [cmd('echo goodbye')])
    expect(state.story.stepIndex).toBe(0)
    expect(state.story.misses).toBe(1)
    expect(shouldPulseHint(state)).toBe(false)
  })

  it('two misses pulse the hint button; four show the first hint', () => {
    const twice = play(config, started(), [cmd('echo a'), cmd('fail')])
    expect(shouldPulseHint(twice)).toBe(true)
    expect(twice.story.hintsShown).toBe(0)
    const four = play(config, twice, [cmd('echo b'), cmd('echo c')])
    expect(four.story.hintsShown).toBe(1)
  })

  it('help-type commands and unknown commands are handled differently', () => {
    const state = play(config, started(), [cmd('hint'), cmd('nonsense')])
    expect(state.story.hintsShown).toBe(1)
    expect(state.story.misses).toBe(1)
  })

  it('hints escalate on request but not past the last one; completing resets them', () => {
    let state = play(config, started(), [
      { type: 'showHint' },
      { type: 'showHint' },
      { type: 'showHint' },
    ])
    expect(state.story.hintsShown).toBe(2)
    state = play(config, state, [{ type: 'revealSolution' }])
    expect(state.story.solutionShown).toBe(true)
    state = play(config, state, [cmd('echo hello')])
    expect(state.story).toMatchObject({ hintsShown: 0, solutionShown: false, misses: 0 })
  })
})

describe('steps', () => {
  it('an optional step can be skipped', () => {
    const state = play(config, started(), [cmd('echo hello'), save])
    expect(state.story.completedSteps).toEqual(['say-hello', 'save'])
    expect(state.story.skippedSteps).toEqual(['peek'])
  })

  it('a step whose goal is already met completes as soon as it is entered', () => {
    const done = playChapter(config, 'toy', [
      cmd('echo hello'),
      save,
      { type: 'flackReply', messageId: 'sam-hi', replyId: 'wave' },
    ]).state
    const next = play(config, done, [{ type: 'continueStory' }])
    expect(next.story.chapterId).toBe('epilogue')
    expect(next.story.completedSteps).toEqual(['already-done'])
    const finished = play(config, next, [cmd('echo bye'), { type: 'continueStory' }])
    expect(finished.story.phase).toBe('finished')
  })

  it('apply hooks can change state, e.g. capture the player name', () => {
    const state = play(config, started(), [cmd('echo hello'), save])
    expect(state.player.name).toBe('Ada Lovelace')
    expect(state.git.local?.working['team.md']).toBe('# Docs team\n\n- Ada\n')
  })
})

describe('effects', () => {
  it('reduce returns delayed effects instead of applying them', () => {
    const state = play(config, started(), [cmd('echo hello')])
    const result = reduce(config, state, save)
    expect(result.effects).toEqual([expect.objectContaining({ id: 'sam-hi', delayMs: 3000 })])
    expect(result.state.flack.messages.some((m) => m.id === 'sam-hi')).toBe(false)

    const applied = reduce(config, result.state, { type: 'applyEffect', effect: result.effects[0] })
    expect(applied.state.flack.messages.find((m) => m.id === 'sam-hi')).toMatchObject({
      from: 'sam',
      quickReplies: [{ id: 'wave', text: '👋' }],
    })
  })

  it('applying the same message twice does not duplicate it', () => {
    const state = started()
    const effect = {
      type: 'flackMessage' as const,
      id: 'welcome',
      channel: 'docs-team',
      from: 'jordan',
      text: 'Hi!',
    }
    expect(
      reduce(config, state, { type: 'applyEffect', effect }).state.flack.messages
    ).toHaveLength(1)
  })

  it('remote commits land on GitNub and raise an event', () => {
    const state = started()
    const before = state.git.remotes['inkwell/docs-site'].branches.main
    const next = reduce(config, state, {
      type: 'applyEffect',
      effect: {
        type: 'remoteCommit',
        slug: 'inkwell/docs-site',
        author: 'sam',
        message: 'Add Sam',
        edits: [{ kind: 'appendLine', path: 'team.md', text: '- Sam Rivera' }],
      },
    }).state
    const remote = next.git.remotes['inkwell/docs-site']
    expect(remote.branches.main).not.toBe(before)
    expect(remote.commits[remote.branches.main].author.name).toBe('Sam Rivera')
  })

  it('quick replies post the learner’s message once', () => {
    const state = play(config, started(), [cmd('echo hello'), save])
    const replied = play(config, state, [
      { type: 'flackReply', messageId: 'sam-hi', replyId: 'wave' },
      { type: 'flackReply', messageId: 'sam-hi', replyId: 'wave' },
    ])
    expect(replied.flack.messages.filter((m) => m.from === 'player').map((m) => m.text)).toEqual([
      '👋',
    ])
  })

  it('asking the mentor posts the question and the answer', () => {
    const state = play(config, started(), [{ type: 'askMentor', questionId: 'what-is-git' }])
    expect(state.flack.messages.slice(-2).map((m) => [m.from, m.text])).toEqual([
      ['player', 'What is Git?'],
      ['robin', 'A time machine for files.'],
    ])
  })

  it('locked tabs cannot be opened', () => {
    const state = play(config, started(), [{ type: 'openTab', tab: 'gitnub' }])
    expect(state.ui.activeTab).toBe('flack')
    const editor = play(config, state, [{ type: 'openTab', tab: 'editor' }])
    expect(editor.ui.activeTab).toBe('editor')
  })
})

describe('restart', () => {
  it('restores the checkpoint taken when the chapter started', () => {
    const fresh = started()
    const progressed = play(config, fresh, [cmd('echo hello'), save])
    const restarted = play(config, progressed, [{ type: 'restartChapter' }])
    expect(restarted.story.stepIndex).toBe(0)
    expect(restarted.story.completedSteps).toEqual([])
    expect(restarted.player.name).toBeUndefined()
    expect(restarted.git.local?.working['team.md']).toBe(fresh.git.local?.working['team.md'])
    expect(restarted.flack.messages.map((m) => m.id)).toEqual(['welcome'])
    expect(restarted.story.checkpoint).toBeDefined()
  })

  it('jumping to a chapter builds its starting state', () => {
    const result = startChapter(config, blankState(config), 'epilogue')
    expect(result.state.story.chapterId).toBe('epilogue')
  })
})

describe('templates', () => {
  it('fills in the player and leaves unknown placeholders alone', () => {
    const state = { ...started(), player: { name: 'Zoë Ng' } }
    expect(interpolate('Add {{player.name}} ({{ player.slug }}) {{nope}}', state)).toBe(
      'Add Zoë Ng (zoe) {{nope}}'
    )
    expect(interpolate('Hi {{player.name}}', started())).toBe('Hi you')
  })
})

describe('terminal actions', () => {
  it('clearTerminal empties the log without touching history or the story', () => {
    const state = play(config, started(), [cmd('echo one'), { type: 'clearTerminal' }])
    expect(state.shell.output).toEqual([])
    expect(state.shell.history).toEqual(['echo one'])
    expect(state.story.misses).toBe(1)
  })

  it('cancelInput echoes the abandoned line with ^C', () => {
    const state = play(config, started(), [{ type: 'cancelInput', text: 'git sta' }])
    expect(state.shell.output.at(-1)?.text).toBe('~ $ git sta^C')
    expect(state.shell.history).toEqual([])
  })
})

describe('editor buffers', () => {
  it('keep unsaved text until saved, and forget it when it matches the file again', () => {
    const state = started()
    const saved = state.git.local!.working['team.md']
    const typing = play(config, state, [
      { type: 'editBuffer', path: 'team.md', content: `${saved}- Ada\n` },
    ])
    expect(typing.editor.buffers['team.md']).toBe(`${saved}- Ada\n`)
    expect(typing.git.local!.working['team.md']).toBe(saved)
    expect(typing.clock).toBe(state.clock)

    const undone = play(config, typing, [{ type: 'editBuffer', path: 'team.md', content: saved }])
    expect(undone.editor.buffers).toEqual({})

    const savedNow = play(config, typing, [
      { type: 'saveFile', path: 'team.md', content: `${saved}- Ada\n` },
    ])
    expect(savedNow.editor.buffers).toEqual({})
    expect(savedNow.git.local!.working['team.md']).toBe(`${saved}- Ada\n`)
  })

  it('a command that would replace a file with unsaved edits is undone and explained', () => {
    const state = play(config, started(), [
      { type: 'editBuffer', path: 'team.md', content: 'draft\n' },
    ])
    const blocked = play(config, state, [cmd('rewrite team.md')])
    expect(blocked.git.local!.working['team.md']).toBe(state.git.local!.working['team.md'])
    expect(blocked.ui.unsavedBlock).toEqual(['team.md'])
    expect(blocked.shell.output.at(-1)?.text).toContain('You have unsaved edits in team.md')
    expect(blocked.shell.history).toEqual(['rewrite team.md'])

    const discarded = play(config, blocked, [{ type: 'discardBuffer', path: 'team.md' }])
    expect(discarded.ui.unsavedBlock).toBeUndefined()
    expect(play(config, discarded, [cmd('rewrite team.md')]).git.local!.working['team.md']).toBe(
      'rewritten\n'
    )
  })

  it('edits to other files do not block', () => {
    const state = play(config, started(), [
      { type: 'editBuffer', path: 'README.md', content: 'draft\n' },
    ])
    expect(play(config, state, [cmd('rewrite team.md')]).git.local!.working['team.md']).toBe(
      'rewritten\n'
    )
  })
})
