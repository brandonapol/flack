import type { GameEvent } from '../events'
import { line, type TerminalLine } from '../lines'
import type { CoreState } from '../state'
import { echoLines } from './prompt'
import type { CommandContext, CommandEffect, CommandResult, Registry } from './registry'
import { suggest } from './suggest'
import { stripPrompt, tokenize } from './tokenize'

export interface RunLineResult<S extends CoreState> {
  state: S
  /** Everything this line added to the terminal, starting with the echoed prompt and command. */
  output: TerminalLine[]
  events: GameEvent[]
  effects: CommandEffect[]
}

function defaultUnknownCommand<S extends CoreState>(
  ctx: CommandContext<S>,
  suggestion?: string
): CommandResult<S> {
  return {
    ok: false,
    output: [
      line(`bash: ${ctx.argv[0]}: command not found`, 'error'),
      line(
        suggestion ? `Did you mean \`${suggestion}\`?` : 'Try `help`, or ask Robin in Flack.',
        'muted'
      ),
    ],
  }
}

function defaultUnknownGitCommand<S extends CoreState>(
  ctx: CommandContext<S>,
  suggestion?: string
): CommandResult<S> {
  const output = [line(`git: '${ctx.argv[1]}' is not a git command. See 'git --help'.`, 'error')]
  if (suggestion) output.push(line(), line('The most similar command is'), line(`\t${suggestion}`))
  return { ok: false, output }
}

function isGitSubcommandCall(argv: string[]): boolean {
  return argv[0] === 'git' && argv.length > 1 && !argv[1].startsWith('-') && argv[1] !== 'help'
}

function dispatch<S extends CoreState>(ctx: CommandContext<S>): CommandResult<S> {
  const { registry, argv } = ctx

  if (isGitSubcommandCall(argv)) {
    const sub = registry.gitSubcommands.get(argv[1])
    if (sub) return sub.run(ctx)
    const suggestion = suggest(argv[1], registry.gitSubcommands.keys())
    return (registry.onUnknownGitCommand ?? defaultUnknownGitCommand)(ctx, suggestion)
  }

  const command = registry.commands.get(argv[0])
  if (command) return command.run(ctx)
  const suggestion = suggest(argv[0], registry.commands.keys())
  return (registry.onUnknownCommand ?? defaultUnknownCommand)(ctx, suggestion)
}

/** Runs one line typed (or pasted) into the terminal. */
export function runLine<S extends CoreState>(
  registry: Registry<S>,
  state: S,
  input: string
): RunLineResult<S> {
  const text = stripPrompt(input)
  const echo = echoLines(state, text)

  if (text === '') {
    return {
      state: withOutput(state, echo),
      output: echo,
      events: [],
      effects: [],
    }
  }

  const history = [...state.shell.history, text]
  const tokens = tokenize(text)
  let result: CommandResult<S>
  let argv: string[] = []
  if (!tokens.ok) {
    result = {
      ok: false,
      output: [
        line(`bash: unexpected EOF while looking for matching \`${tokens.quote}'`, 'error'),
        line(
          `A quote mark (${tokens.quote}) was opened but never closed. Add the closing one and try again.`,
          'muted'
        ),
      ],
    }
  } else {
    argv = tokens.argv
    const before: S = withOutput({ ...state, shell: { ...state.shell, history } }, echo)
    result = dispatch({ state: before, argv, registry })
    result = { ...result, state: result.state ?? before }
  }

  const base: S = result.state ?? withOutput({ ...state, shell: { ...state.shell, history } }, echo)
  const output = result.output ?? []
  const commandEvent: GameEvent[] =
    argv.length > 0 ? [{ type: 'command', name: argv[0], argv, ok: result.ok ?? true }] : []

  // A command like `clear` empties the log; don't put the echo back in that case.
  const cleared = base.shell.output.length === 0
  return {
    state: withOutput(base, output),
    output: cleared ? output : [...echo, ...output],
    events: [...commandEvent, ...(result.events ?? [])],
    effects: result.effects ?? [],
  }
}

function withOutput<S extends CoreState>(state: S, lines: TerminalLine[]): S {
  if (lines.length === 0) return state
  return { ...state, shell: { ...state.shell, output: [...state.shell.output, ...lines] } }
}
