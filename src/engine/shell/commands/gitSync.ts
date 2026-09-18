import { merge, rebase } from '../../git/merge'
import { formatMerge, formatNotPossibleToFastForward, formatRebase } from '../../git/mergeOutput'
import { formatIdentityUnknown } from '../../git/output'
import { refreshPullRequests } from '../../git/pullRequests'
import { resolveRef } from '../../git/refs'
import { hasIdentity, remoteUrl } from '../../git/repo'
import { fetch, pull, push } from '../../git/sync'
import { formatFetch, formatPull, formatPush } from '../../git/syncOutput'
import type { CommitId, GitConfig, LocalRepo, Person } from '../../git/types'
import { line, type TerminalLine } from '../../lines'
import type { CoreState } from '../../state'
import { registerGitCommand, type Registry } from '../registry'
import {
  fail,
  notARepo,
  type Failure,
  parseArgs,
  repoContext,
  withLocal,
  withRemote,
} from './helpers'

function unknownRemote(name: string): Failure {
  return fail(
    line(`fatal: '${name}' does not appear to be a git repository`, 'error'),
    line('fatal: Could not read from remote repository.', 'error'),
    line(),
    line('Please make sure you have the correct access rights', 'error'),
    line('and the repository exists.', 'error')
  )
}

export function registerGitSyncCommands<S extends CoreState>(registry: Registry<S>) {
  registerGitCommand(registry, {
    name: 'push',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      if (argv.some((arg) => arg === '-f' || arg.startsWith('--force'))) {
        return fail(
          line('Flack won’t force-push, and at work you almost never should either.', 'muted'),
          line(
            '💡 `--force` tells GitNub to throw away what it has and take your copy instead — including',
            'muted'
          ),
          line(
            '   anyone else’s work. If a push is refused, bring their changes in first: `git pull`, or',
            'muted'
          ),
          line('   Update branch on your pull request.', 'muted')
        )
      }
      const parsed = parseArgs(argv.slice(2), { flags: ['-u', '--set-upstream'] })
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown option \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const [remoteName, refspec] = parsed.positional
      if (remoteName && remoteName !== 'origin') return unknownRemote(remoteName)
      const setUpstream = parsed.flags.has('-u') || parsed.flags.has('--set-upstream')
      const branch = refspec === 'HEAD' ? repo.local.head : refspec?.split(':')[0]

      if (setUpstream && !branch) {
        const result = push(repo.local, repo.remote)
        if (result.kind === 'no-upstream') {
          return fail(...formatPush(result, repo.local.slug))
        }
      }

      const result = push(repo.local, repo.remote, {
        branch: branch ?? (remoteName ? repo.local.head : undefined),
        setUpstream,
      })
      const output = formatPush(result, repo.local.slug)
      if (!result.ok) return fail(...output)
      let next = withLocal(state, result.local)
      if (result.kind === 'pushed') next = withRemote(next, refreshPullRequests(result.remote))
      const events =
        result.kind === 'pushed'
          ? [
              {
                type: 'branchPushed' as const,
                branch: result.remoteBranch,
                created: !result.update.from,
              },
            ]
          : []
      return { state: next, output, events }
    },
  })

  registerGitCommand(registry, {
    name: 'fetch',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      const parsed = parseArgs(argv.slice(2), { flags: ['--prune', '-p', '--all'] })
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown option \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const remoteName = parsed.positional[0]
      if (remoteName && remoteName !== 'origin') return unknownRemote(remoteName)
      const result = fetch(repo.local, repo.remote, {
        prune: parsed.flags.has('--prune') || parsed.flags.has('-p'),
      })
      return { state: withLocal(state, result.local), output: formatFetch(result, repo.local.slug) }
    },
  })

  registerGitCommand(registry, {
    name: 'pull',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      const parsed = parseArgs(argv.slice(2), {
        flags: ['--ff-only', '--rebase', '-r', '--no-rebase', '--ff'],
      })
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown option \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const [remoteName, branch] = parsed.positional
      if (remoteName && remoteName !== 'origin') return unknownRemote(remoteName)

      const result = pull(repo.local, repo.remote, { remoteBranch: branch })
      const next = 'local' in result ? withLocal(state, result.local) : state
      if (result.kind !== 'diverged') {
        return { state: next, output: formatPull(result, repo.local.slug), ok: result.ok }
      }

      // Diverged: flags win over config, and with neither Git refuses and explains the choice.
      const fetched = formatFetch(result.fetch, repo.local.slug)
      const flags = parsed.flags
      const mode =
        flags.has('--rebase') || flags.has('-r')
          ? 'rebase'
          : flags.has('--no-rebase')
            ? 'merge'
            : flags.has('--ff-only') || state.git.config.pullFf === 'only'
              ? 'ff-only'
              : state.git.config.pullRebase === true
                ? 'rebase'
                : state.git.config.pullRebase === false
                  ? 'merge'
                  : undefined

      if (mode === 'ff-only') {
        return { state: next, ok: false, output: [...fetched, ...formatNotPossibleToFastForward()] }
      }
      if (mode === 'rebase') {
        const rebased = rebase(result.local, result.to, { timestamp: state.clock })
        return {
          state: rebased.ok ? withLocal(state, rebased.local) : next,
          ok: rebased.ok,
          output: [...fetched, ...formatRebase(rebased, result.local.head, 'pull with rebase')],
        }
      }
      if (mode === 'merge') {
        const author = identity(state.git.config)
        if (!author)
          return { state: next, ok: false, output: [...fetched, ...formatIdentityUnknown()] }
        const upstream = branch ?? result.local.upstreams[result.local.head]
        const merged = merge(result.local, result.to, {
          message: `Merge branch '${upstream}' of ${remoteUrl(repo.local.slug).replace(/\.git$/, '')}`,
          author,
          timestamp: state.clock,
        })
        return {
          state: merged.ok ? withLocal(state, merged.local) : next,
          ok: merged.ok,
          output: [...fetched, ...formatMerge(merged, `origin/${upstream}`)],
        }
      }

      return {
        state: next,
        ok: false,
        output: [
          ...formatPull(result, repo.local.slug),
          line(),
          line(
            '💡 Your branch and GitNub’s both have commits the other doesn’t. `git pull --rebase` puts yours',
            'muted'
          ),
          line(
            '   on top of theirs; `git pull --no-rebase` joins them with a merge commit. If this branch has',
            'muted'
          ),
          line(
            '   a pull request, Update branch on its GitNub page does the rebase for you.',
            'muted'
          ),
        ],
      }
    },
  })

  registerGitCommand(registry, {
    name: 'merge',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      if (argv.includes('--abort') || argv.includes('--continue')) {
        return fail(
          line(
            argv.includes('--abort')
              ? 'fatal: There is no merge to abort (MERGE_HEAD missing).'
              : 'fatal: There is no merge in progress (MERGE_HEAD missing).',
            'error'
          ),
          line(
            '💡 Flack never leaves a merge half-done, so there’s nothing to finish or undo.',
            'muted'
          )
        )
      }
      const parsed = parseArgs(argv.slice(2), { flags: ['--ff-only', '--no-ff', '--no-edit'] })
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown option \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const target = resolveTarget(repo.local, parsed.positional[0])
      if (!target.ok) return fail(...target.output)

      // Only a merge commit needs to know who you are; a fast-forward makes no commit.
      const author = identity(state.git.config)
      const result = merge(repo.local, target.id, {
        message: target.local
          ? `Merge branch '${target.name}'`
          : target.name.startsWith('origin/')
            ? `Merge remote-tracking branch '${target.name}'`
            : `Merge commit '${target.name}'`,
        author: author ?? { name: '', email: '' },
        timestamp: state.clock,
      })
      if (result.kind === 'merge' && !author) return fail(...formatIdentityUnknown())
      return {
        state: result.ok ? withLocal(state, result.local) : state,
        ok: result.ok,
        output: formatMerge(result, target.name),
      }
    },
  })

  registerGitCommand(registry, {
    name: 'rebase',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      const args = argv.slice(2)
      if (
        args.some((arg) => ['-i', '--interactive', '--continue', '--abort', '--skip'].includes(arg))
      ) {
        return fail(
          line(`Flack doesn’t do \`git rebase ${args.join(' ')}\` in the terminal.`, 'muted'),
          line(
            '💡 Rebases never stop half-way here. To squash or reorder commits, try the Commit Lab.',
            'muted'
          )
        )
      }
      const parsed = parseArgs(args, { flags: [] })
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown option \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const target = resolveTarget(repo.local, parsed.positional[0], 'rebase')
      if (!target.ok) return fail(...target.output)

      const result = rebase(repo.local, target.id, { timestamp: state.clock })
      return {
        state: result.ok ? withLocal(state, result.local) : state,
        ok: result.ok,
        output: formatRebase(result, repo.local.head),
      }
    },
  })
}

function identity(config: GitConfig): Person | undefined {
  return hasIdentity(config) ? { name: config.userName!, email: config.userEmail! } : undefined
}

type Target =
  { ok: true; id: CommitId; name: string; local: boolean } | { ok: false; output: TerminalLine[] }

/** What to merge or rebase onto: the ref typed, or the current branch's upstream. */
function resolveTarget(
  local: LocalRepo,
  ref: string | undefined,
  command: 'merge' | 'rebase' = 'merge'
): Target {
  if (ref === undefined) {
    const upstream = local.upstreams[local.head]
    const id = upstream ? local.remoteBranches[upstream] : undefined
    if (!upstream || !id) {
      return {
        ok: false,
        output:
          command === 'merge'
            ? [line('fatal: No remote for the current branch.', 'error')]
            : [
                line('There is no tracking information for the current branch.', 'error'),
                line('Please specify which branch you want to rebase against.', 'error'),
              ],
      }
    }
    return { ok: true, id, name: `origin/${upstream}`, local: false }
  }
  const id = resolveRef(local, ref)
  if (!id) {
    return {
      ok: false,
      output:
        command === 'merge'
          ? [line(`merge: ${ref} - not something we can merge`, 'error')]
          : [line(`fatal: invalid upstream '${ref}'`, 'error')],
    }
  }
  return { ok: true, id, name: ref, local: ref in local.branches }
}
