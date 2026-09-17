import type { LocalRepo, RemoteRepo } from '../../git/types'
import { line, type TerminalLine } from '../../lines'
import type { CoreState } from '../../state'
import { currentDir, repoPath, resolvePath } from '../fs'
import type { CommandResult } from '../registry'

export interface RepoContext {
  local: LocalRepo
  remote: RemoteRepo
  /** Path of the working directory inside the repo: `''` at the top, `docs` inside docs/. */
  cwdInRepo: string
}

/** The clone the terminal is currently inside, or undefined when `cwd` is outside it. */
export function repoContext(state: CoreState): RepoContext | undefined {
  const local = state.git.local
  if (!local) return undefined
  const cwdInRepo = repoPath(state, currentDir(state))
  if (cwdInRepo === undefined) return undefined
  const remote = state.git.remotes[local.slug]
  return { local, remote, cwdInRepo }
}

/** A result that changes nothing, so it fits any command's result type. */
export type Failure = Omit<CommandResult, 'state'>

export function notARepo(state: CoreState): Failure {
  const tip = state.git.local
    ? `💡 You're not inside the repo folder yet. Try \`cd ${state.git.local.dir}\` first.`
    : '💡 There’s no repository here yet. Clone one from GitNub first.'
  return {
    ok: false,
    output: [
      line('fatal: not a git repository (or any of the parent directories): .git', 'error'),
      line(tip, 'muted'),
    ],
  }
}

export function fail(...output: TerminalLine[]): Failure {
  return { ok: false, output }
}

export function withLocal<S extends CoreState>(state: S, local: LocalRepo): S {
  return { ...state, git: { ...state.git, local } }
}

export function withRemote<S extends CoreState>(state: S, remote: RemoteRepo): S {
  return {
    ...state,
    git: { ...state.git, remotes: { ...state.git.remotes, [remote.slug]: remote } },
  }
}

export type PathspecResolution =
  { ok: true; specs: string[] } | { ok: false; result: CommandResult }

/**
 * Turns pathspecs typed relative to the working directory into repo-relative ones, like Git does:
 * in `docs/`, `git add .` means `docs` and `git add welcome.md` means `docs/welcome.md`.
 */
export function resolvePathspecs(
  state: CoreState,
  repo: RepoContext,
  args: string[]
): PathspecResolution {
  const specs: string[] = []
  const cwd = currentDir(state)
  for (const arg of args) {
    const absolute = resolvePath(cwd, arg)
    const relative = repoPath(state, absolute)
    if (relative === undefined) {
      return {
        ok: false,
        result: fail(
          line(
            `fatal: ${arg}: '${arg}' is outside repository at '${resolvePath(cwd, '~')}/${repo.local.dir}'`,
            'error'
          )
        ),
      }
    }
    specs.push(relative)
  }
  return { ok: true, specs }
}

/** Splits `-m "x"`-style options from positional arguments. Supports `--flag=value` too. */
export function parseArgs(
  argv: string[],
  spec: { flags?: string[]; options?: string[] }
): {
  flags: Set<string>
  options: Map<string, string[]>
  positional: string[]
  unknown: string[]
  missingValue?: string
} {
  const flags = new Set<string>()
  const options = new Map<string, string[]>()
  const positional: string[] = []
  const unknown: string[] = []
  const knownFlags = new Set(spec.flags ?? [])
  const knownOptions = new Set(spec.options ?? [])
  let onlyPositional = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (onlyPositional || !arg.startsWith('-') || arg === '-') {
      positional.push(arg)
      continue
    }
    if (arg === '--') {
      onlyPositional = true
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    if (knownOptions.has(name)) {
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1)
      if (value === undefined) return { flags, options, positional, unknown, missingValue: name }
      options.set(name, [...(options.get(name) ?? []), value])
    } else if (knownFlags.has(arg)) {
      flags.add(arg)
    } else if (/^-[a-zA-Z]{2,}$/.test(arg)) {
      // Bundled short flags: -am "msg", -la
      const letters = arg.slice(1).split('')
      for (let j = 0; j < letters.length; j++) {
        const short = `-${letters[j]}`
        if (knownOptions.has(short)) {
          const rest = letters.slice(j + 1).join('')
          const value = rest || argv[++i]
          if (value === undefined)
            return { flags, options, positional, unknown, missingValue: short }
          options.set(short, [...(options.get(short) ?? []), value])
          break
        }
        if (knownFlags.has(short)) flags.add(short)
        else unknown.push(short)
      }
    } else {
      unknown.push(arg)
    }
  }
  return { flags, options, positional, unknown }
}
