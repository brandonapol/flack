import type { GameEvent } from '../events'
import type { TerminalLine } from '../lines'
import type { CoreState } from '../state'

/** Requests from a command to the world outside the terminal, handled by the game reducer. */
export type CommandEffect =
  | { type: 'openTab'; tab: 'flack' | 'gitnub' | 'editor' }
  | { type: 'unlockTab'; tab: 'flack' | 'gitnub' | 'editor' }
  | { type: 'openFile'; path: string }
  | { type: 'showHint' }

export interface CommandContext<S extends CoreState = CoreState> {
  state: S
  /** Full argv, including the command name (and `git` for git subcommands). */
  argv: string[]
  registry: Registry<S>
}

export interface CommandResult<S extends CoreState = CoreState> {
  /** Omit when the command doesn't change anything. */
  state?: S
  output?: TerminalLine[]
  /** Defaults to true. Set false when the command failed or refused. */
  ok?: boolean
  /** Extra events beyond the automatic `command` event. */
  events?: GameEvent[]
  effects?: CommandEffect[]
}

export interface Command<S extends CoreState = CoreState> {
  name: string
  /** One line for `help`. */
  summary?: string
  run(ctx: CommandContext<S>): CommandResult<S>
}

export interface Registry<S extends CoreState = CoreState> {
  commands: Map<string, Command<S>>
  gitSubcommands: Map<string, Command<S>>
  /** Replaces the default "command not found" response. */
  onUnknownCommand?: (ctx: CommandContext<S>, suggestion?: string) => CommandResult<S>
  /** Replaces the default "is not a git command" response. */
  onUnknownGitCommand?: (ctx: CommandContext<S>, suggestion?: string) => CommandResult<S>
}

export function createRegistry<S extends CoreState = CoreState>(
  options: Pick<Registry<S>, 'onUnknownCommand' | 'onUnknownGitCommand'> = {}
): Registry<S> {
  return { commands: new Map(), gitSubcommands: new Map(), ...options }
}

export function registerCommand<S extends CoreState>(
  registry: Registry<S>,
  command: Command<S>,
  aliases: string[] = []
): void {
  for (const name of [command.name, ...aliases]) registry.commands.set(name, command)
}

/** Registers `git <name>`. */
export function registerGitCommand<S extends CoreState>(
  registry: Registry<S>,
  command: Command<S>,
  aliases: string[] = []
): void {
  for (const name of [command.name, ...aliases]) registry.gitSubcommands.set(name, command)
}
