import { fetch, pull, push } from '../../git/sync'
import { formatFetch, formatPull, formatPush } from '../../git/syncOutput'
import { line } from '../../lines'
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
      if (result.kind === 'pushed') next = withRemote(next, result.remote)
      return { state: next, output }
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
        flags: ['--ff-only', '--rebase', '--no-rebase', '--ff'],
      })
      if (parsed.unknown.length > 0) {
        return fail(
          line(`error: unknown option \`${parsed.unknown[0].replace(/^-+/, '')}'`, 'error')
        )
      }
      const [remoteName, branch] = parsed.positional
      if (remoteName && remoteName !== 'origin') return unknownRemote(remoteName)

      const result = pull(repo.local, repo.remote, { remoteBranch: branch })
      const output = formatPull(result, repo.local.slug)
      const next = 'local' in result ? withLocal(state, result.local) : state

      if (result.kind === 'diverged') {
        output.push(
          line(),
          line(
            '💡 Your branch and GitNub’s both have commits the other doesn’t. In Flack you won’t need to untangle',
            'muted'
          ),
          line(
            '   this in the terminal: if this branch has a pull request, use Update branch on its GitNub page.',
            'muted'
          )
        )
      }
      return { state: next, output, ok: result.ok }
    },
  })
}
