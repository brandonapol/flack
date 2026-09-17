import { line, spans, type TerminalLine } from '../../lines'
import type { CoreState } from '../../state'
import {
  changeDirectory,
  currentDir,
  displayPath,
  lookup,
  repoPath,
  resolvePath,
  type DirEntry,
} from '../fs'
import { registerCommand, type Command, type CommandResult, type Registry } from '../registry'
import { fail } from './helpers'
import type { CommandOptions } from './index'

const EDITORS = ['vim', 'vi', 'nano', 'emacs', 'pico']
const NOT_NEEDED = ['rm', 'sudo', 'mv', 'mkdir', 'touch', 'cp', 'rmdir', 'chmod']

/** Commands that need `ui.unlockedTabs`, which lives on the full game state. */
function editorUnlocked(state: CoreState): boolean {
  const ui = (state as CoreState & { ui?: { unlockedTabs: string[] } }).ui
  return ui ? ui.unlockedTabs.includes('editor') : true
}

function helpGroup(title: string, rows: Array<[string, string, boolean?]>): TerminalLine[] {
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 2
  return [
    line(title, 'bold'),
    ...rows.map(([usage, summary, dim]) =>
      line(`  ${usage.padEnd(width)}${summary}`, dim ? 'muted' : undefined)
    ),
    line(),
  ]
}

export function registerShellCommands<S extends CoreState>(
  registry: Registry<S>,
  options: CommandOptions<S>
) {
  const docs = options.docs
  const add = (command: Command<S>, aliases: string[] = []) =>
    registerCommand(registry, command, aliases)

  add({
    name: 'help',
    summary: 'Show this list',
    run: ({ state }) => {
      const hasRepo = Boolean(state.git.local)
      const git = registry.gitSubcommands
      const gitRows: Array<[string, string, boolean?]> = [
        ['git clone <url>', 'Copy a repository from GitNub'],
        ['git status', 'See what has changed', !hasRepo],
        ['git diff', 'See exactly which lines changed', !hasRepo],
        ['git add <file>', 'Pick changes for your next commit', !hasRepo],
        ['git commit -m "…"', 'Save the picked changes as a commit', !hasRepo],
        ['git log --oneline', 'List recent commits', !hasRepo],
        ['git switch -c <name>', 'Start a new branch', !hasRepo],
        ['git push', 'Send your commits to GitNub', !hasRepo],
        ['git pull', 'Bring in what’s new on GitNub', !hasRepo],
        ['git config', 'Tell Git your name and email'],
      ]
      const available = gitRows.filter(([usage]) => git.has(usage.split(' ')[1]))
      return {
        output: [
          line('Flack’s terminal understands these commands:'),
          line(),
          ...helpGroup('Moving around', [
            ['pwd', 'Show which folder you’re in'],
            ['ls', 'List what’s in this folder (ls -a shows hidden files)'],
            ['cd <folder>', 'Go into a folder (cd .. goes back up)'],
          ]),
          ...helpGroup('Looking at files', [
            ['cat <file>', 'Print a file'],
            [
              'open <file>',
              'Open a file in the Editor (code <file> works too)',
              !editorUnlocked(state),
            ],
          ]),
          ...(available.length > 0 ? helpGroup('Git', available) : []),
          ...helpGroup('Getting unstuck', [
            ['hint', 'Show a hint for the step you’re on'],
            ['clear', 'Clear the screen (or press Ctrl+L)'],
            ['history', 'List the commands you’ve run'],
            ['git help', 'List every Git command Flack knows'],
          ]),
          line(`New to the terminal? ${docs.commandLine.label}: ${docs.commandLine.href}`, 'muted'),
        ],
      }
    },
  })

  add({
    name: 'hint',
    summary: 'Show a hint',
    run: ({ state }) => {
      const hint = options.hintFor?.(state)
      if (!hint) {
        return {
          output: [line('No hints for this step. You can always ask Robin in Flack.', 'muted')],
        }
      }
      return {
        output: [spans({ text: '💡 Hint: ', tone: 'bold' }, { text: hint })],
        effects: [{ type: 'showHint' }],
      }
    },
  })

  add({
    name: 'clear',
    summary: 'Clear the screen',
    run: ({ state }) => ({ state: { ...state, shell: { ...state.shell, output: [] } } }),
  })

  add({
    name: 'history',
    run: ({ state }) => ({
      output: state.shell.history.map((entry, i) => line(`${String(i + 1).padStart(5)}  ${entry}`)),
    }),
  })

  add({
    name: 'pwd',
    run: ({ state }) => ({ output: [line(currentDir(state))] }),
  })

  add({
    name: 'ls',
    run: ({ state, argv }) => {
      const flags = new Set<string>()
      const paths: string[] = []
      for (const arg of argv.slice(1)) {
        if (arg.startsWith('-') && arg.length > 1) {
          for (const letter of arg.slice(1)) {
            if (!'alA1'.includes(letter)) {
              return fail(
                line(`ls: invalid option -- ${letter}`, 'error'),
                line('usage: ls [-alA1] [file ...]', 'muted')
              )
            }
            flags.add(letter)
          }
        } else {
          paths.push(arg)
        }
      }
      const all = flags.has('a') || flags.has('A')
      const long = flags.has('l')
      const cwd = currentDir(state)
      const targets = paths.length > 0 ? paths : ['.']
      const output: TerminalLine[] = []
      let ok = true

      targets.forEach((target, index) => {
        const node = lookup(state, resolvePath(cwd, target))
        if (!node) {
          output.push(line(`ls: ${target}: No such file or directory`, 'error'))
          ok = false
          return
        }
        if (node.type === 'file') {
          output.push(
            long ? longRow(target, 'file', node.content.length, state.clock) : line(target)
          )
          return
        }
        if (targets.length > 1) output.push(...(index > 0 ? [line()] : []), line(`${target}:`))
        let entries: DirEntry[] = node.entries.filter((entry) => all || !entry.name.startsWith('.'))
        if (flags.has('a'))
          entries = [{ name: '.', type: 'dir' }, { name: '..', type: 'dir' }, ...entries]
        if (long) {
          output.push(line(`total ${entries.length * 8}`))
          for (const entry of entries) {
            const size =
              entry.type === 'dir' ? 96 + 32 * 3 : sizeOf(state, resolvePath(node.path, entry.name))
            output.push(longRow(entry.name, entry.type, size, state.clock))
          }
        } else if (entries.length > 0) {
          output.push(
            spans(
              ...entries.flatMap((entry, i) => [
                ...(i > 0 ? [{ text: '  ' }] : []),
                entry.type === 'dir'
                  ? { text: entry.name, tone: 'meta' as const }
                  : { text: entry.name },
              ])
            )
          )
        }
      })
      return { ok, output }
    },
  })

  add({
    name: 'cd',
    run: ({ state, argv }) => {
      const result = changeDirectory(state, argv[1])
      if (!result.ok) return fail(line(result.message, 'error'))
      return { state: { ...state, shell: { ...state.shell, cwd: result.cwd } } }
    },
  })

  add({
    name: 'cat',
    run: ({ state, argv }) => {
      const files = argv.slice(1)
      if (files.length === 0) {
        return fail(line('cat needs a file name, like `cat README.md`.', 'muted'))
      }
      const output: TerminalLine[] = []
      let ok = true
      for (const file of files) {
        const node = lookup(state, resolvePath(currentDir(state), file))
        if (!node) {
          output.push(line(`cat: ${file}: No such file or directory`, 'error'))
          ok = false
        } else if (node.type === 'dir') {
          output.push(line(`cat: ${file}: Is a directory`, 'error'))
          ok = false
        } else {
          const text = node.content.endsWith('\n') ? node.content.slice(0, -1) : node.content
          output.push(...text.split('\n').map((part) => line(part)))
        }
      }
      return { ok, output }
    },
  })

  const openCommand: Command<S> = {
    name: 'open',
    run: ({ state, argv }) => openInEditor(state, argv),
  }
  add(openCommand, ['code'])

  for (const editor of EDITORS) {
    add({
      name: editor,
      run: ({ state, argv }) => {
        const opened = openInEditor(state, argv)
        return {
          ...opened,
          ok: false,
          output: [
            line(`In Flack, you edit files in the Editor tab instead of \`${editor}\`.`, 'muted'),
            ...(opened.ok === false ? (opened.output ?? []) : []),
          ],
        }
      },
    })
  }

  for (const command of NOT_NEEDED) {
    add({
      name: command,
      run: () =>
        fail(
          line(`\`${command}\` isn’t needed in this tutorial, so nothing was changed.`, 'muted')
        ),
    })
  }

  return registry
}

function openInEditor<S extends CoreState>(state: S, argv: string[]): CommandResult<S> {
  if (!editorUnlocked(state)) {
    return fail(line('The Editor isn’t unlocked yet. You’ll get to it soon!', 'muted'))
  }
  const target = argv[1]
  if (!target || target === '.') return { effects: [{ type: 'openTab', tab: 'editor' }] }
  const absolute = resolvePath(currentDir(state), target)
  const node = lookup(state, absolute)
  const relative = repoPath(state, absolute)
  if (!node) {
    return fail(line(`The file ${displayPath(absolute)} does not exist.`, 'error'))
  }
  if (relative === undefined || relative === '.git' || relative.startsWith('.git/')) {
    return fail(line('The Editor can only open files inside the repo you cloned.', 'muted'))
  }
  if (node.type === 'dir') return { effects: [{ type: 'openTab', tab: 'editor' }] }
  return { effects: [{ type: 'openFile', path: relative }] }
}

function sizeOf(state: CoreState, path: string): number {
  const node = lookup(state, path)
  return node?.type === 'file' ? node.content.length : 96
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function longRow(name: string, type: 'dir' | 'file', size: number, clock: number): TerminalLine {
  const date = new Date(clock * 1000)
  const when = `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2)} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
  const mode = type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'
  const links = type === 'dir' ? 3 : 1
  const prefix = `${mode}  ${String(links).padStart(2)} you  staff  ${String(size).padStart(5)} ${when} `
  return spans({ text: prefix }, type === 'dir' ? { text: name, tone: 'meta' } : { text: name })
}
