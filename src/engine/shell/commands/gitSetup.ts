import { clone, remoteUrl, repoDirName } from '../../git/repo'
import type { GitConfig } from '../../git/types'
import { line, type TerminalLine } from '../../lines'
import { HOME, type CoreState } from '../../state'
import { currentDir, lookup } from '../fs'
import {
  registerCommand,
  registerGitCommand,
  type Command,
  type CommandResult,
  type Registry,
} from '../registry'
import { fail, notARepo, repoContext, withLocal } from './helpers'

/** Real `git help` summaries, grouped the way Git groups them. */
const GIT_HELP: Array<[string, Array<[string, string]>]> = [
  ['start a working area', [['clone', 'Clone a repository into a new directory']]],
  [
    'work on the current change',
    [
      ['add', 'Add file contents to the index'],
      ['restore', 'Restore working tree files'],
    ],
  ],
  [
    'examine the history and state',
    [
      ['diff', 'Show changes between commits, commit and working tree, etc'],
      ['log', 'Show commit logs'],
      ['show', 'Show various types of objects'],
      ['status', 'Show the working tree status'],
    ],
  ],
  [
    'grow, mark and tweak your common history',
    [
      ['branch', 'List, create, or delete branches'],
      ['commit', 'Record changes to the repository'],
      ['merge', 'Join two or more development histories together'],
      ['rebase', 'Reapply commits on top of another base tip'],
      ['switch', 'Switch branches'],
    ],
  ],
  [
    'collaborate',
    [
      ['fetch', 'Download objects and refs from another repository'],
      ['pull', 'Fetch from and integrate with another repository or a local branch'],
      ['push', 'Update remote refs along with associated objects'],
    ],
  ],
  [
    'set up',
    [
      ['config', 'Get and set repository or global options'],
      ['remote', 'Manage set of tracked repositories'],
    ],
  ],
]

export const GIT_VERSION = '2.46.0'

const CLONE_URL = /^(?:https?:\/\/)?(?:www\.)?([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/

export function registerGitSetupCommands<S extends CoreState>(registry: Registry<S>) {
  const git = (command: Command<S>, aliases: string[] = []) =>
    registerGitCommand(registry, command, aliases)

  registerCommand(registry, {
    name: 'git',
    run: ({ argv }) => {
      const flag = argv[1]
      if (flag === '--version' || flag === '-v' || flag === 'version') {
        return { output: [line(`git version ${GIT_VERSION}`)] }
      }
      if (flag && flag !== '--help' && flag !== '-h' && flag !== 'help') {
        return fail(
          line(`unknown option: ${flag}`, 'error'),
          line('usage: git [-v | --version] [-h | --help] <command> [<args>]')
        )
      }
      if (flag === 'help' && argv[2]) {
        return {
          output: [
            line(
              `Flack doesn’t include Git’s manual pages. Try \`git ${argv[2]}\` to see how it responds, or read https://git-scm.com/docs/git-${argv[2]}`,
              'muted'
            ),
          ],
        }
      }
      const output: TerminalLine[] = [
        line('usage: git [-v | --version] [-h | --help] <command> [<args>]'),
        line(),
        line('These are the Git commands you can use in Flack:'),
      ]
      for (const [group, commands] of GIT_HELP) {
        const available = commands.filter(([name]) => registry.gitSubcommands.has(name))
        if (available.length === 0) continue
        output.push(
          line(),
          line(group),
          ...available.map(([name, summary]) => line(`   ${name.padEnd(11)}${summary}`))
        )
      }
      return { ok: flag !== undefined, output }
    },
  })

  git({
    name: 'version',
    run: () => ({ output: [line(`git version ${GIT_VERSION}`)] }),
  })

  git({
    name: 'config',
    run: ({ state, argv }) => {
      const args = argv.slice(2)
      const global = args.includes('--global')
      const rest = args.filter((arg) => arg !== '--global' && arg !== '--local')

      if (rest[0] === '--list' || rest[0] === '-l') {
        const { userName, userEmail, pullRebase, pullFf } = state.git.config
        const output: TerminalLine[] = []
        output.push(line('credential.helper=osxkeychain'), line('init.defaultbranch=main'))
        if (userName) output.push(line(`user.name=${userName}`))
        if (userEmail) output.push(line(`user.email=${userEmail}`))
        if (pullRebase !== undefined) output.push(line(`pull.rebase=${pullRebase}`))
        if (pullFf) output.push(line(`pull.ff=${pullFf}`))
        const repo = repoContext(state)
        if (repo && !global) {
          output.push(
            line('core.repositoryformatversion=0'),
            line(`remote.origin.url=${remoteUrl(repo.local.slug)}`),
            line('remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*'),
            ...Object.entries(repo.local.upstreams).flatMap(([branch, upstream]) => [
              line(`branch.${branch}.remote=origin`),
              line(`branch.${branch}.merge=refs/heads/${upstream}`),
            ])
          )
        }
        return { output }
      }

      if (rest[0] === '--edit' || rest[0] === '-e') {
        return fail(
          line('Flack can’t open a config editor. Set values directly instead:', 'muted'),
          line('  git config --global user.name "Your Name"', 'muted')
        )
      }

      if (rest.length === 0) {
        return fail(
          line('usage: git config [<options>]', 'error'),
          line('Try: git config --global user.name "Your Name"', 'muted')
        )
      }

      const [key, ...values] = rest
      if (!key.includes('.')) {
        return fail(line(`error: key does not contain a section: ${key}`, 'error'))
      }

      if (values.length > 1) {
        return fail(
          line('error: wrong number of arguments, should be from 1 to 2', 'error'),
          line(
            `💡 Put the value in quotes so Git sees it as one thing: git config${global ? ' --global' : ''} ${key} "${values.join(' ')}"`,
            'muted'
          )
        )
      }

      const field =
        key === 'user.name' ? 'userName' : key === 'user.email' ? 'userEmail' : undefined
      if (values.length === 0) {
        const value = field ? state.git.config[field] : pullSetting(state.git.config, key)
        return value ? { output: [line(value)] } : { ok: false }
      }

      if (!global && !repoContext(state)) {
        return fail(
          line('fatal: not in a git directory', 'error'),
          line(
            '💡 Add --global to set it for every repository: git config --global ' +
              key +
              ` "${values[0]}"`,
            'muted'
          )
        )
      }

      if (key === 'pull.rebase' || key === 'pull.ff') {
        const config = setPullSetting(state.git.config, key, values[0])
        if (!config) {
          return fail(
            line(`fatal: bad boolean config value '${values[0]}' for '${key}'`, 'error'),
            line(
              key === 'pull.rebase'
                ? '💡 Use true (rebase) or false (merge).'
                : '💡 Flack understands `git config pull.ff only`.',
              'muted'
            )
          )
        }
        return { state: { ...state, git: { ...state.git, config } } }
      }

      if (!field) {
        const lower = key.toLowerCase()
        const close = lower.startsWith('user.')
          ? lower.includes('mail')
            ? 'user.email'
            : 'user.name'
          : undefined
        return {
          output: close
            ? [
                line(
                  `💡 Git saved \`${key}\`, but it only reads \`${close}\`. Check the spelling and run it again.`,
                  'muted'
                ),
              ]
            : [],
        }
      }

      return {
        state: {
          ...state,
          git: { ...state.git, config: { ...state.git.config, [field]: values[0] } },
        },
      }
    },
  })

  git({
    name: 'clone',
    run: ({ state, argv }): CommandResult<S> => {
      const target = argv.slice(2).find((arg) => !arg.startsWith('-'))
      if (!target) {
        return fail(
          line('fatal: You must specify a repository to clone.', 'error'),
          line(),
          line('usage: git clone [<options>] [--] <repo> [<dir>]'),
          line(
            '💡 Copy the address from the Code button on GitNub, then paste it after `git clone `.',
            'muted'
          )
        )
      }
      if (target.startsWith('<') || target.endsWith('>')) {
        return fail(
          line(
            `💡 Replace ${target} with the address you copied from GitNub (no angle brackets).`,
            'muted'
          )
        )
      }
      if (/^git@/.test(target)) {
        return fail(
          line('git@gitnub.com: Permission denied (publickey).', 'error'),
          line('fatal: Could not read from remote repository.', 'error'),
          line(
            '💡 That’s the SSH address, which needs keys set up. Use the HTTPS address from the Code button instead.',
            'muted'
          )
        )
      }

      const match = CLONE_URL.exec(target)
      if (!match) {
        return fail(
          line(`fatal: repository '${target}' does not exist`, 'error'),
          line(
            '💡 Copy the full address from the Code button on GitNub, starting with https://',
            'muted'
          )
        )
      }
      const [, host, org, repoName] = match
      if (host !== 'gitnub.com') {
        return fail(
          line(
            `fatal: unable to access 'https://${host}/${org}/${repoName}.git/': Could not resolve host: ${host}`,
            'error'
          ),
          line(
            '💡 Everything in Flack is pretend, so only gitnub.com addresses work here.',
            'muted'
          )
        )
      }

      const slug = `${org}/${repoName}`
      const remote = state.git.remotes[slug]
      if (!remote) {
        return fail(
          line('remote: Repository not found.', 'error'),
          line(`fatal: repository '${remoteUrl(slug)}/' not found`, 'error'),
          line(
            '💡 Check the spelling, or copy the address from the Code button on GitNub.',
            'muted'
          )
        )
      }
      if (remote.cloneNote) return fail(line(remote.cloneNote, 'muted'))

      const dir = repoDirName(slug)
      const cwd = currentDir(state)
      if (lookup(state, `${cwd}/${dir}`) || (cwd === HOME && state.git.local)) {
        return fail(
          line(
            `fatal: destination path '${dir}' already exists and is not an empty directory.`,
            'error'
          )
        )
      }
      if (cwd !== HOME) {
        return fail(
          line(
            `💡 Clone from your home folder so the repo ends up at ~/${dir}. Run \`cd ~\` first.`,
            'muted'
          )
        )
      }

      const objects = Object.keys(remote.commits).length * 4 + 3
      const deltas = Math.max(1, Math.floor(objects / 6))
      return {
        state: withLocal(state, clone(remote)),
        output: [
          line(`Cloning into '${dir}'...`),
          line(`remote: Enumerating objects: ${objects}, done.`, 'muted'),
          line(`remote: Counting objects: 100% (${objects}/${objects}), done.`, 'muted'),
          line(`remote: Compressing objects: 100% (${objects - 4}/${objects - 4}), done.`, 'muted'),
          line(
            `remote: Total ${objects} (delta ${deltas}), reused ${objects - 2} (delta 1), pack-reused 0`,
            'muted'
          ),
          line(`Receiving objects: 100% (${objects}/${objects}), done.`, 'muted'),
          line(`Resolving deltas: 100% (${deltas}/${deltas}), done.`, 'muted'),
        ],
        // Which tabs are open is the story's business: Chapter 1 unlocks the Editor.
      }
    },
  })

  git({
    name: 'remote',
    run: ({ state, argv }) => {
      const repo = repoContext(state)
      if (!repo) return notARepo(state)
      const url = remoteUrl(repo.local.slug)
      if (argv[2] === '-v' || argv[2] === '--verbose') {
        return { output: [line(`origin\t${url} (fetch)`), line(`origin\t${url} (push)`)] }
      }
      if (argv[2] === undefined) return { output: [line('origin')] }
      if (argv[2] === 'get-url') return { output: [line(url)] }
      return fail(line(`Flack only supports \`git remote\` and \`git remote -v\`.`, 'muted'))
    },
  })
}

function pullSetting(config: GitConfig, key: string): string | undefined {
  if (key === 'pull.rebase') return config.pullRebase?.toString()
  if (key === 'pull.ff') return config.pullFf
  return undefined
}

/** `pull.rebase true|false` and `pull.ff only`. Undefined for a value Flack doesn't model. */
function setPullSetting(config: GitConfig, key: string, value: string): GitConfig | undefined {
  const lower = value.toLowerCase()
  if (key === 'pull.rebase') {
    if (['true', 'yes', 'on', '1'].includes(lower)) return { ...config, pullRebase: true }
    if (['false', 'no', 'off', '0'].includes(lower)) return { ...config, pullRebase: false }
    return undefined
  }
  if (lower === 'only') return { ...config, pullFf: 'only' }
  if (['true', 'false'].includes(lower)) return { ...config, pullFf: undefined }
  return undefined
}
