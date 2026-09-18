import { spans, type TerminalLine } from '../lines'
import type { CoreState } from '../state'
import { currentDir, displayPath, repoPath } from './fs'

/** Who and where the terminal says you are, as Git Bash on a Windows laptop would. */
export const USER_HOST = 'you@INKWELL-LAPTOP'
export const SYSTEM = 'MINGW64'

/** The branch Git Bash shows in brackets, or undefined outside a repo. */
function branchFor(state: CoreState): string | undefined {
  const local = state.git.local
  if (!local || repoPath(state, currentDir(state)) === undefined) return undefined
  return local.head
}

/** Where you are: `~/docs-site (main)`, or just `~` outside a repo. */
export function locationFor(state: CoreState): string {
  const branch = branchFor(state)
  return `${displayPath(currentDir(state))}${branch ? ` (${branch})` : ''}`
}

/** Git Bash's prompt line: `you@INKWELL-LAPTOP MINGW64 ~/docs-site (main)`. `$` goes below it. */
export function promptFor(state: CoreState): string {
  return `${USER_HOST} ${SYSTEM} ${locationFor(state)}`
}

/** How many lines `echoLines` produces, for code that needs to skip past the echo. */
export const ECHO_LINES = 3

/**
 * A command as Git Bash echoes it: a blank line, the coloured prompt line, then `$ command`.
 * `suffix` is added after the command (`^C` when a line is abandoned).
 */
export function echoLines(state: CoreState, command: string, suffix = ''): TerminalLine[] {
  return [
    { text: '' },
    promptLine(state),
    spans({ text: '$', tone: 'prompt' }, { text: ` ${command}${suffix}` }),
  ]
}

/** The prompt line in Git Bash's colours: green user, purple MINGW64, yellow path, cyan branch. */
export function promptLine(state: CoreState): TerminalLine {
  const branch = branchFor(state)
  return spans(
    { text: USER_HOST, tone: 'prompt-user' },
    { text: ' ' },
    { text: SYSTEM, tone: 'prompt-system' },
    { text: ' ' },
    { text: displayPath(currentDir(state)), tone: 'prompt-path' },
    ...(branch ? [{ text: ` (${branch})`, tone: 'prompt-branch' as const }] : [])
  )
}

/** The window title Git Bash shows: `MINGW64:/c/Users/you/docs-site`. */
export function windowTitle(state: CoreState): string {
  return `${SYSTEM}:/c${currentDir(state)}`
}
