import { deleteBranch, switchBranch, type SwitchResult } from '../../git/branches'
import { shortId } from '../../git/hash'
import { formatTracking } from '../../git/output'
import { resolveRef } from '../../git/refs'
import { discard } from '../../git/repo'
import { getUpstream } from '../../git/status'
import type { GameEvent } from '../../events'
import { line, spans, type TerminalLine } from '../../lines'
import type { CoreState } from '../../state'
import { registerGitCommand, type CommandResult, type Registry } from '../registry'
import {
  fail,
  notARepo,
  parseArgs,
  repoContext,
  resolvePathspecs,
  withLocal,
  type RepoContext,
} from './helpers'

const CHECKOUT_TIP = '💡 Newer Git calls this `git switch`. Both work.'

function switchOutput<S extends CoreState>(
  state: S,
  result: SwitchResult,
  extra: TerminalLine[] = []
): CommandResult<S> {
  if (!result.ok) {
    switch (result.kind) {
      case 'exists':
        return fail(
          line(`fatal: a branch named '${result.branch}' already exists`, 'error'),
          line(`💡 To move to it, run \`git switch ${result.branch}\`.`, 'muted')
        )
      case 'invalid-name':
        return fail(
          line(`fatal: '${result.branch}' is not a valid branch name`, 'error'),
          line(
            '💡 Branch names can’t contain spaces. Use dashes instead, like `add-my-name`.',
            'muted'
          )
        )
      case 'invalid-reference':
        return fail(
          line(`fatal: invalid reference: ${result.branch}`, 'error'),
          line(
            `💡 To start a new branch with that name, run \`git switch -c ${result.branch}\`.`,
            'muted'
          )
        )
      case 'would-overwrite':
        return fail(
          line(
            'error: Your local changes to the following files would be overwritten by checkout:',
            'error'
          ),
          ...result.paths.map((path) => line(`\t${path}`, 'error')),
          line('Please commit your changes or stash them before you switch branches.', 'error'),
          line('Aborting', 'error')
        )
    }
  }

  const { local } = result
  const tracking = formatTracking({ upstream: getUpstream(local) })
  const events: GameEvent[] = []
  let output: TerminalLine[]
  if (result.kind === 'created') {
    output = [line(`Switched to a new branch '${local.head}'`)]
    if (result.tracking)
      output.push(line(`branch '${local.head}' set up to track 'origin/${result.tracking}'.`))
    events.push({ type: 'branchCreated', branch: local.head })
  } else if (result.kind === 'switched') {
    output = [line(`Switched to branch '${local.head}'`), ...tracking]
  } else {
    output = [line(`Already on '${local.head}'`), ...tracking]
  }
  events.push({ type: 'branchSwitched', branch: local.head })
  return { state: withLocal(state, local), output: [...output, ...extra], events }
}

function startPoint(repo: RepoContext, ref: string | undefined): string | undefined | false {
  if (ref === undefined) return undefined
  return resolveRef(repo.local, ref) ?? false
}

export function registerGitBranchCommands<S extends CoreState>(registry: Registry<S>) {
  registerGitCommand(registry, {
    name: 'switch',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      const parsed = parseArgs(argv.slice(2), { options: ['-c', '--create', '-C'] })
      if (parsed.missingValue) {
        return fail(
          line(
            `error: switch \`${parsed.missingValue.replace(/^-+/, '')}' requires a value`,
            'error'
          )
        )
      }
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown switch \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const created =
        parsed.options.get('-c') ?? parsed.options.get('--create') ?? parsed.options.get('-C')
      if (created) {
        if (parsed.positional.length > 1 || (created.length === 1 && created[0].includes(' '))) {
          const name = [created[0], ...parsed.positional].join(' ')
          return switchOutput(state, { ok: false, kind: 'invalid-name', branch: name })
        }
        const start = startPoint(repo, parsed.positional[0])
        if (start === false)
          return fail(line(`fatal: invalid reference: ${parsed.positional[0]}`, 'error'))
        return switchOutput(
          state,
          switchBranch(repo.local, created[0], { create: true, startPoint: start })
        )
      }
      const target = parsed.positional[0]
      if (!target) return fail(line('fatal: missing branch or commit argument', 'error'))
      if (parsed.positional.length > 1) {
        return fail(
          line(`fatal: only one reference expected, ${parsed.positional.length} given.`, 'error'),
          line(
            '💡 Branch names can’t contain spaces. Use dashes instead, like `add-my-name`.',
            'muted'
          )
        )
      }
      return switchOutput(state, switchBranch(repo.local, target))
    },
  })

  registerGitCommand(registry, {
    name: 'checkout',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      const parsed = parseArgs(argv.slice(2), { options: ['-b', '-B'] })
      if (parsed.missingValue) {
        return fail(
          line(
            `error: switch \`${parsed.missingValue.replace(/^-+/, '')}' requires a value`,
            'error'
          )
        )
      }
      const created = parsed.options.get('-b') ?? parsed.options.get('-B')
      const tip = [line(CHECKOUT_TIP, 'muted')]
      if (created) {
        const start = startPoint(repo, parsed.positional[0])
        if (start === false)
          return fail(
            line(
              `fatal: '${parsed.positional[0]}' is not a commit and a branch '${created[0]}' cannot be created from it`,
              'error'
            )
          )
        return switchOutput(
          state,
          switchBranch(repo.local, created[0], { create: true, startPoint: start }),
          tip
        )
      }

      const dashDash = argv.indexOf('--')
      const target = parsed.positional[0]
      if (!target)
        return fail(line('💡 Tell Git which branch to move to, like `git checkout main`.', 'muted'))
      const isBranch = target in repo.local.branches || target in repo.local.remoteBranches
      if (dashDash === -1 && isBranch) {
        return switchOutput(state, switchBranch(repo.local, target), tip)
      }

      // `git checkout <file>` / `git checkout -- <file>`: the old way to discard changes.
      const resolved = resolvePathspecs(state, repo, parsed.positional)
      if (!resolved.ok) return resolved.result
      const result = discard(repo.local, resolved.specs)
      if (!result.ok) {
        return fail(
          line(`error: pathspec '${target}' did not match any file(s) known to git`, 'error')
        )
      }
      const changed = result.paths.filter(
        (path) => repo.local.working[path] !== result.local.working[path]
      ).length
      return {
        state: withLocal(state, result.local),
        output: [
          line(`Updated ${changed} path${changed === 1 ? '' : 's'} from the index`),
          line(
            '💡 Newer Git calls this `git restore <file>`. Both throw away unsaved changes.',
            'muted'
          ),
        ],
      }
    },
  })

  registerGitCommand(registry, {
    name: 'branch',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      const parsed = parseArgs(argv.slice(2), {
        flags: ['-a', '--all', '-r', '--remotes', '--list', '-v', '-vv', '--show-current'],
        options: ['-d', '--delete', '-D'],
      })
      if (parsed.missingValue) return fail(line('fatal: branch name required', 'error'))
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown switch \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const { local } = repo

      if (parsed.flags.has('--show-current')) return { output: [line(local.head)] }

      const toDelete = [
        ...(parsed.options.get('-d') ?? []),
        ...(parsed.options.get('--delete') ?? []),
        ...parsed.positional.filter(
          () =>
            parsed.options.has('-d') || parsed.options.has('--delete') || parsed.options.has('-D')
        ),
      ]
      const force = parsed.options.has('-D')
      const forced = parsed.options.get('-D') ?? []
      if (toDelete.length > 0 || forced.length > 0) {
        let next = local
        const output: TerminalLine[] = []
        let ok = true
        for (const name of [...toDelete, ...forced]) {
          const result = deleteBranch(next, name, force)
          if (result.ok) {
            next = result.local
            output.push(line(`Deleted branch ${name} (was ${shortId(result.was)}).`))
          } else if (result.kind === 'not-found') {
            ok = false
            output.push(line(`error: branch '${name}' not found`, 'error'))
          } else if (result.kind === 'current') {
            ok = false
            output.push(
              line(
                `error: cannot delete branch '${name}' used by worktree at '/Users/you/${local.dir}'`,
                'error'
              ),
              line('💡 Switch to another branch first, like `git switch main`.', 'muted')
            )
          } else {
            ok = false
            output.push(
              line(`error: the branch '${name}' is not fully merged`, 'error'),
              line(
                `hint: If you are sure you want to delete it, run 'git branch -D ${name}'`,
                'muted'
              ),
              line(
                '💡 After a squash merge, Git can’t tell your commits made it to main, because they became one new commit. If GitNub shows the merge request as merged, -D is safe.',
                'muted'
              )
            )
          }
        }
        return { ok, state: withLocal(state, next), output }
      }

      if (parsed.positional.length > 0) {
        return fail(
          line('💡 To start a new branch and move to it, use `git switch -c <name>`.', 'muted')
        )
      }

      const all = parsed.flags.has('-a') || parsed.flags.has('--all')
      const remotes = parsed.flags.has('-r') || parsed.flags.has('--remotes')
      const output: TerminalLine[] = []
      if (!remotes) {
        for (const name of Object.keys(local.branches).sort()) {
          output.push(
            name === local.head
              ? spans({ text: '* ' }, { text: name, tone: 'staged' })
              : line(`  ${name}`)
          )
        }
      }
      if (all || remotes) {
        const prefix = all ? 'remotes/' : ''
        if (local.remoteBranches[local.remoteHead]) {
          output.push(
            spans(
              { text: `  ${prefix}origin/HEAD`, tone: 'error' },
              { text: ` -> origin/${local.remoteHead}` }
            )
          )
        }
        for (const name of Object.keys(local.remoteBranches).sort()) {
          output.push(line(`  ${prefix}origin/${name}`, 'error'))
        }
      }
      return { output }
    },
  })
}
