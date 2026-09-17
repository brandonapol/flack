import { describe, expect, it } from 'vitest'

import { line, plainText } from '../lines'
import type { CoreState } from '../state'
import { freshState } from './__fixtures__/state'
import { createRegistry, registerCommand, registerGitCommand, type Registry } from './registry'
import { runLine } from './run'

function testRegistry(): Registry {
  const registry = createRegistry()
  registerCommand(registry, {
    name: 'echo',
    run: ({ argv }) => ({ output: [line(argv.slice(1).join(' '))] }),
  })
  registerCommand(registry, {
    name: 'clear',
    run: ({ state }) => ({ state: { ...state, shell: { ...state.shell, output: [] } } }),
  })
  registerCommand(registry, {
    name: 'fail',
    run: () => ({ ok: false, output: [line('nope', 'error')] }),
  })
  registerGitCommand(registry, {
    name: 'status',
    run: () => ({ output: [line('On branch main')] }),
  })
  registerGitCommand(registry, {
    name: 'commit',
    run: ({ argv }) => ({ output: [line(`committed: ${argv[3]}`)] }),
  })
  return registry
}

const run = (input: string, state: CoreState = freshState()) =>
  runLine(testRegistry(), state, input)

describe('runLine', () => {
  it('echoes the prompt and command, runs it, and records history', () => {
    const result = run('echo hello   world')
    expect(plainText(result.output)).toBe('~ $ echo hello   world\nhello world')
    expect(result.output[0].spans?.[0]).toEqual({ text: '~ $', tone: 'prompt' })
    expect(result.state.shell.history).toEqual(['echo hello   world'])
    expect(result.state.shell.output).toEqual(result.output)
    expect(result.events).toEqual([
      { type: 'command', name: 'echo', argv: ['echo', 'hello', 'world'], ok: true },
    ])
  })

  it('passes quoted arguments through to git subcommands', () => {
    const result = run(`$ git commit -m "Add Robin's name"`)
    expect(plainText(result.output)).toBe(
      `~ $ git commit -m "Add Robin's name"\ncommitted: Add Robin's name`
    )
    expect(result.events[0]).toMatchObject({
      name: 'git',
      argv: ['git', 'commit', '-m', "Add Robin's name"],
    })
  })

  it('reports failures in the command event', () => {
    expect(run('fail').events[0]).toMatchObject({ ok: false })
  })

  it('a blank line just echoes the prompt', () => {
    const result = run('   ')
    expect(plainText(result.output)).toBe('~ $ ')
    expect(result.state.shell.history).toEqual([])
    expect(result.events).toEqual([])
  })

  it('clear leaves an empty log', () => {
    const first = run('echo hi')
    const cleared = run('clear', first.state)
    expect(cleared.state.shell.output).toEqual([])
    expect(cleared.state.shell.history).toEqual(['echo hi', 'clear'])
  })

  it('unknown commands get a friendly reply and a suggestion when close', () => {
    expect(plainText(run('foo').output)).toBe(
      '~ $ foo\nflack: command not found: foo\nTry `help`, or ask Robin in Flack.'
    )
    expect(plainText(run('ecoh hi').output)).toContain('Did you mean `echo`?')
    expect(run('foo').events[0]).toMatchObject({ ok: false })
  })

  it('git typos get Git’s own suggestion', () => {
    expect(plainText(run('git comit -m x').output)).toBe(
      `~ $ git comit -m x
git: 'comit' is not a git command. See 'git --help'.

The most similar command is
\tcommit`
    )
    expect(plainText(run('git stauts').output)).toContain('\tstatus')
    expect(plainText(run('git frobnicate').output)).toBe(
      "~ $ git frobnicate\ngit: 'frobnicate' is not a git command. See 'git --help'."
    )
  })

  it('an unterminated quote is explained, not run', () => {
    const result = run('git commit -m "oops')
    expect(plainText(result.output)).toContain('flack: unmatched "')
    expect(result.events).toEqual([])
    expect(result.state.shell.history).toEqual(['git commit -m "oops'])
  })

  it('custom unknown handlers replace the defaults', () => {
    const registry = createRegistry({
      onUnknownCommand: ({ argv }) => ({ ok: false, output: [line(`no ${argv[0]} here`)] }),
    })
    expect(plainText(runLine(registry, freshState(), 'vim').output)).toBe('~ $ vim\nno vim here')
  })
})
