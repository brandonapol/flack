import { diffStat, diffTreesDetailed } from '../../git/diff'
import {
  formatCommitSummary,
  formatDiff,
  formatIdentityUnknown,
  formatLog,
  formatShow,
  formatStatus,
  formatStatusShort,
} from '../../git/output'
import { resolveRef } from '../../git/refs'
import { commit, headTree, log, stage, unstage, discard } from '../../git/repo'
import { getStatus } from '../../git/status'
import { pathspecMatches } from '../../git/tree'
import type { FileTree } from '../../git/types'
import { line, type TerminalLine } from '../../lines'
import type { CoreState } from '../../state'
import { registerGitCommand, type Command, type CommandResult, type Registry } from '../registry'
import {
  type Failure,
  fail,
  notARepo,
  parseArgs,
  repoContext,
  resolvePathspecs,
  withLocal,
  type RepoContext,
} from './helpers'

function unknownOption(option: string): Failure {
  const name = option.replace(/^-+/, '')
  return fail(
    line(`error: unknown ${option.startsWith('--') ? 'option' : 'switch'} \`${name}'`, 'error')
  )
}

function ambiguous(arg: string): Failure {
  return fail(
    line(
      `fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.`,
      'error'
    ),
    line("Use '--' to separate paths from revisions, like this:", 'error'),
    line("'git <command> [<revision>...] -- [<file>...]'", 'error')
  )
}

function filterTree(tree: FileTree, specs: string[]): FileTree {
  if (specs.length === 0) return tree
  return Object.fromEntries(
    Object.entries(tree).filter(([path]) => specs.some((spec) => pathspecMatches(spec, path)))
  )
}

export function registerGitLocalCommands<S extends CoreState>(registry: Registry<S>) {
  const git = (command: Command<S>) => registerGitCommand(registry, command)

  /** Runs `body` when inside a repo; otherwise prints Git's "not a git repository". */
  const inRepo =
    (body: (state: S, repo: RepoContext, args: string[]) => CommandResult<S>) =>
    ({ state, argv }: { state: S; argv: string[] }): CommandResult<S> => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      return body(state, repo, argv.slice(2))
    }

  git({
    name: 'status',
    run: inRepo((_state, repo, args) => {
      const parsed = parseArgs(args, { flags: ['-s', '--short', '--long'] })
      if (parsed.unknown.length > 0) return unknownOption(parsed.unknown[0])
      const status = getStatus(repo.local)
      const short = parsed.flags.has('-s') || parsed.flags.has('--short')
      return { output: short ? formatStatusShort(status) : formatStatus(status) }
    }),
  })

  git({
    name: 'add',
    run: inRepo((state, repo, args) => {
      const parsed = parseArgs(args, { flags: ['-A', '--all', '.', '-v', '--verbose'] })
      if (parsed.unknown.length > 0) return unknownOption(parsed.unknown[0])
      const all = parsed.flags.has('-A') || parsed.flags.has('--all')
      if (!all && parsed.positional.length === 0) {
        return fail(
          line('Nothing specified, nothing added.', 'error'),
          line("hint: Maybe you wanted to say 'git add .'?", 'muted'),
          line(
            'hint: Disable this message with "git config set advice.addEmptyPathspec false"',
            'muted'
          )
        )
      }
      let specs: string[] = ['']
      if (!all) {
        const resolved = resolvePathspecs(state, repo, parsed.positional)
        if (!resolved.ok) return resolved.result
        specs = resolved.specs
      }
      const result = stage(repo.local, specs)
      if (!result.ok) {
        const typed = parsed.positional[specs.indexOf(result.error.path)] ?? result.error.path
        return fail(line(`fatal: pathspec '${typed}' did not match any files`, 'error'))
      }
      const output: TerminalLine[] =
        parsed.flags.has('-v') || parsed.flags.has('--verbose')
          ? result.paths
              .filter((path) => repo.local.index[path] !== result.local.index[path])
              .map((path) => line(`add '${path}'`))
          : []
      return { state: withLocal(state, result.local), output }
    }),
  })

  git({
    name: 'restore',
    run: inRepo((state, repo, args) => {
      const parsed = parseArgs(args, { flags: ['--staged', '-S', '--worktree', '-W'] })
      if (parsed.unknown.length > 0) return unknownOption(parsed.unknown[0])
      if (parsed.positional.length === 0) {
        return fail(line('fatal: you must specify path(s) to restore', 'error'))
      }
      const resolved = resolvePathspecs(state, repo, parsed.positional)
      if (!resolved.ok) return resolved.result
      const staged = parsed.flags.has('--staged') || parsed.flags.has('-S')
      const result = staged
        ? unstage(repo.local, resolved.specs)
        : discard(repo.local, resolved.specs)
      if (!result.ok) {
        const typed =
          parsed.positional[resolved.specs.indexOf(result.error.path)] ?? result.error.path
        return fail(
          line(`error: pathspec '${typed}' did not match any file(s) known to git`, 'error')
        )
      }
      return { state: withLocal(state, result.local) }
    }),
  })

  git({
    name: 'diff',
    run: inRepo((state, repo, args) => {
      const parsed = parseArgs(args, { flags: ['--staged', '--cached', '--stat'] })
      if (parsed.unknown.length > 0) return unknownOption(parsed.unknown[0])
      const resolved = resolvePathspecs(state, repo, parsed.positional)
      if (!resolved.ok) return resolved.result
      const { local } = repo
      const known = new Set([
        ...Object.keys(local.working),
        ...Object.keys(local.index),
        ...Object.keys(headTree(local)),
      ])
      for (const [i, spec] of resolved.specs.entries()) {
        if (![...known].some((path) => pathspecMatches(spec, path))) {
          return ambiguous(parsed.positional[i])
        }
      }
      const staged = parsed.flags.has('--staged') || parsed.flags.has('--cached')
      const [from, to] = staged
        ? [headTree(local), local.index]
        : [local.index, filterTracked(local.working, local.index)]
      return {
        output: formatDiff(
          diffTreesDetailed(filterTree(from, resolved.specs), filterTree(to, resolved.specs))
        ),
      }
    }),
  })

  git({
    name: 'commit',
    run: inRepo((state, repo, args) => {
      const parsed = parseArgs(args, {
        flags: ['-a', '--all', '--amend', '-q', '--quiet', '-v', '--verbose'],
        options: ['-m', '--message'],
      })
      if (parsed.missingValue) {
        return fail(
          line(
            `error: switch \`${parsed.missingValue.replace(/^-+/, '')}' requires a value`,
            'error'
          )
        )
      }
      if (parsed.flags.has('--amend')) {
        return fail(
          line(
            '💡 `git commit --amend` rewrites your last commit. It isn’t part of this tutorial yet.',
            'muted'
          )
        )
      }
      if (parsed.unknown.length > 0) return unknownOption(parsed.unknown[0])
      const messages = [
        ...(parsed.options.get('-m') ?? []),
        ...(parsed.options.get('--message') ?? []),
      ]
      if (parsed.positional.length > 0 && messages.length === 0) {
        return fail(
          line(
            `error: pathspec '${parsed.positional[0]}' did not match any file(s) known to git`,
            'error'
          ),
          line('💡 Did you forget the -m? Try: git commit -m "Your message"', 'muted')
        )
      }
      if (messages.length === 0) {
        return fail(
          line(
            '💡 Real Git would open a text editor here so you can write a commit message.',
            'muted'
          ),
          line('   In Flack, add the message right on the command line instead:', 'muted'),
          line('   git commit -m "Describe your change"', 'muted')
        )
      }

      let local = repo.local
      if (parsed.flags.has('-a') || parsed.flags.has('--all')) {
        const tracked = Object.keys(local.index)
        const result = stage(
          local,
          tracked.filter((path) => local.working[path] !== local.index[path]).length > 0
            ? tracked
            : []
        )
        if (result.ok) local = result.local
      }

      const parent = headTree(local)
      const result = commit(local, {
        message: messages.join('\n\n'),
        config: state.git.config,
        timestamp: state.clock,
      })
      if (!result.ok) {
        if (result.error === 'identity-unknown') return fail(...formatIdentityUnknown())
        if (result.error === 'empty-message') {
          return fail(line('Aborting commit due to empty commit message.', 'error'))
        }
        return fail(...formatStatus(getStatus(local)))
      }
      const quiet = parsed.flags.has('-q') || parsed.flags.has('--quiet')
      return {
        state: withLocal(state, result.local),
        output: quiet
          ? []
          : formatCommitSummary(local.head, result.commit, diffStat(parent, result.commit.tree)),
      }
    }),
  })

  git({
    name: 'log',
    run: inRepo((_state, repo, args) => {
      const parsed = parseArgs(args, {
        flags: ['--oneline', '--all', '--graph', '--decorate', '--no-decorate'],
        options: ['-n', '--max-count'],
      })
      if (parsed.missingValue) {
        return fail(
          line(
            `error: switch \`${parsed.missingValue.replace(/^-+/, '')}' requires a value`,
            'error'
          )
        )
      }
      let limit: number | undefined
      const unknown: string[] = []
      for (const option of parsed.unknown) {
        if (/^-\d+$/.test(option)) limit = Number(option.slice(1))
        else unknown.push(option)
      }
      if (unknown.length > 0) return unknownOption(unknown[0])
      const count = parsed.options.get('-n') ?? parsed.options.get('--max-count')
      if (count) limit = Number(count[count.length - 1])

      const { local } = repo
      const starts: string[] = []
      for (const ref of parsed.positional) {
        const id = resolveRef(local, ref)
        if (!id) return ambiguous(ref)
        starts.push(id)
      }
      if (parsed.flags.has('--all')) {
        starts.push(...Object.values(local.branches), ...Object.values(local.remoteBranches))
      }
      if (starts.length === 0) starts.push(local.branches[local.head])

      let commits = log(local.commits, starts)
      if (limit !== undefined && Number.isFinite(limit))
        commits = commits.slice(0, Math.max(0, limit))
      const refs = parsed.flags.has('--no-decorate') ? undefined : local
      return { output: formatLog(commits, { oneline: parsed.flags.has('--oneline'), refs }) }
    }),
  })

  git({
    name: 'show',
    run: inRepo((_state, repo, args) => {
      const parsed = parseArgs(args, { flags: ['--stat', '--oneline'] })
      if (parsed.unknown.length > 0) return unknownOption(parsed.unknown[0])
      const { local } = repo
      const ref = parsed.positional[0] ?? 'HEAD'
      const id = resolveRef(local, ref)
      if (!id) return ambiguous(ref)
      const shown = local.commits[id]
      const parentTree = shown.parents[0] ? local.commits[shown.parents[0]].tree : {}
      const output: TerminalLine[] = formatShow(
        shown,
        diffTreesDetailed(parentTree, shown.tree),
        local
      )
      return { output }
    }),
  })
}

/** Untracked files never show up in `git diff`. */
function filterTracked(working: FileTree, index: FileTree): FileTree {
  return Object.fromEntries(Object.entries(working).filter(([path]) => path in index))
}
