/**
 * Formatters that turn model results into text that looks like real Git (2.4x) output.
 * Reference output was captured from real `git` and lives next to each test in output.test.ts.
 */
import { line, spans, type Span, type TerminalLine } from '../lines'
import type { FileDiff, FileStat } from './diff'
import { shortId } from './hash'
import { sortPaths } from './tree'
import type { Change, Commit, CommitId } from './types'
import type { Status } from './status'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// ---------------------------------------------------------------- status

const LABELS: Record<Change['kind'], string> = {
  modified: 'modified:   ',
  new: 'new file:   ',
  deleted: 'deleted:    ',
}

function upstreamLines(status: Status): TerminalLine[] {
  const upstream = status.upstream
  if (!upstream) return []
  const name = `'${upstream.name}'`
  if (upstream.gone) {
    return [
      line(`Your branch is based on ${name}, but the upstream is gone.`),
      line('  (use "git branch --unset-upstream" to fixup)'),
      line(),
    ]
  }
  const { ahead, behind } = upstream
  if (ahead === 0 && behind === 0) {
    return [line(`Your branch is up to date with ${name}.`), line()]
  }
  if (behind === 0) {
    return [
      line(`Your branch is ahead of ${name} by ${plural(ahead, 'commit', 'commits')}.`),
      line('  (use "git push" to publish your local commits)'),
      line(),
    ]
  }
  if (ahead === 0) {
    return [
      line(
        `Your branch is behind ${name} by ${plural(behind, 'commit', 'commits')}, and can be fast-forwarded.`
      ),
      line('  (use "git pull" to update your local branch)'),
      line(),
    ]
  }
  return [
    line(`Your branch and ${name} have diverged,`),
    line(`and have ${ahead} and ${behind} different commits each, respectively.`),
    line('  (use "git pull" if you want to integrate the remote branch with yours)'),
    line(),
  ]
}

export function formatStatus(status: Status): TerminalLine[] {
  const out: TerminalLine[] = [line(`On branch ${status.branch}`), ...upstreamLines(status)]

  if (status.staged.length > 0) {
    out.push(
      line('Changes to be committed:'),
      line('  (use "git restore --staged <file>..." to unstage)'),
      ...status.staged.map((change) => line(`\t${LABELS[change.kind]}${change.path}`, 'staged')),
      line()
    )
  }

  if (status.unstaged.length > 0) {
    const hasDeletion = status.unstaged.some((change) => change.kind === 'deleted')
    out.push(
      line('Changes not staged for commit:'),
      line(
        `  (use "git ${hasDeletion ? 'add/rm' : 'add'} <file>..." to update what will be committed)`
      ),
      line('  (use "git restore <file>..." to discard changes in working directory)'),
      ...status.unstaged.map((change) =>
        line(`\t${LABELS[change.kind]}${change.path}`, 'unstaged')
      ),
      line()
    )
  }

  if (status.untracked.length > 0) {
    out.push(
      line('Untracked files:'),
      line('  (use "git add <file>..." to include in what will be committed)'),
      ...status.untracked.map((path) => line(`\t${path}`, 'unstaged')),
      line()
    )
  }

  // With something staged there's no footer: real Git ends on the section's blank line.
  if (status.staged.length > 0) return out
  if (status.unstaged.length > 0) {
    out.push(line('no changes added to commit (use "git add" and/or "git commit -a")'))
  } else if (status.untracked.length > 0) {
    out.push(line('nothing added to commit but untracked files present (use "git add" to track)'))
  } else {
    out.push(line('nothing to commit, working tree clean'))
  }
  return out
}

const SHORT_CODE: Record<Change['kind'], string> = { modified: 'M', new: 'A', deleted: 'D' }

export function formatStatusShort(status: Status): TerminalLine[] {
  const staged = new Map(status.staged.map((change) => [change.path, SHORT_CODE[change.kind]]))
  const unstaged = new Map(status.unstaged.map((change) => [change.path, SHORT_CODE[change.kind]]))
  const tracked = sortPaths(new Set([...staged.keys(), ...unstaged.keys()]))
  return [
    ...tracked.map((path) => {
      const x = staged.get(path)
      const y = unstaged.get(path)
      return spans(
        { text: x ?? ' ', tone: 'staged' },
        { text: y ?? ' ', tone: 'unstaged' },
        { text: ` ${path}` }
      )
    }),
    ...status.untracked.map((path) =>
      spans({ text: '??', tone: 'unstaged' }, { text: ` ${path}` })
    ),
  ]
}

// ---------------------------------------------------------------- diff

export function formatDiff(diffs: FileDiff[]): TerminalLine[] {
  const out: TerminalLine[] = []
  for (const diff of diffs) {
    const a = diff.kind === 'new' ? '/dev/null' : `a/${diff.path}`
    const b = diff.kind === 'deleted' ? '/dev/null' : `b/${diff.path}`
    out.push(line(`diff --git a/${diff.path} b/${diff.path}`, 'bold'))
    if (diff.kind === 'new') out.push(line('new file mode 100644', 'bold'))
    if (diff.kind === 'deleted') out.push(line('deleted file mode 100644', 'bold'))
    const mode = diff.kind === 'modified' ? ' 100644' : ''
    out.push(
      line(`index ${diff.oldBlob}..${diff.newBlob}${mode}`, 'bold'),
      line(`--- ${a}`, 'bold'),
      line(`+++ ${b}`, 'bold')
    )
    for (const hunk of diff.hunks) {
      const at = hunk.header.indexOf(' @@') + 3
      const context = hunk.header.slice(at)
      out.push(
        context
          ? spans({ text: hunk.header.slice(0, at), tone: 'meta' }, { text: context })
          : line(hunk.header, 'meta')
      )
      for (const text of hunk.lines) {
        if (text.startsWith('+')) out.push(line(text, 'success'))
        else if (text.startsWith('-')) out.push(line(text, 'error'))
        else out.push(line(text))
      }
    }
  }
  return out
}

export function formatChangeSummary(stats: FileStat[]): TerminalLine[] {
  const insertions = stats.reduce((sum, stat) => sum + stat.insertions, 0)
  const deletions = stats.reduce((sum, stat) => sum + stat.deletions, 0)
  let summary = ` ${plural(stats.length, 'file changed', 'files changed')}`
  if (insertions > 0) summary += `, ${plural(insertions, 'insertion(+)', 'insertions(+)')}`
  if (deletions > 0) summary += `, ${plural(deletions, 'deletion(-)', 'deletions(-)')}`
  return [
    line(summary),
    ...stats
      .filter((stat) => stat.kind !== 'modified')
      .map((stat) =>
        line(` ${stat.kind === 'new' ? 'create' : 'delete'} mode 100644 ${stat.path}`)
      ),
  ]
}

const MAX_GRAPH = 40

/** ` team.md | 1 +` lines followed by the summary, as printed by pull and merge. */
export function formatDiffstat(stats: FileStat[]): TerminalLine[] {
  const nameWidth = Math.max(...stats.map((stat) => stat.path.length))
  const totals = stats.map((stat) => stat.insertions + stat.deletions)
  const countWidth = String(Math.max(...totals)).length
  const largest = Math.max(...totals)
  const scale = largest > MAX_GRAPH ? MAX_GRAPH / largest : 1
  const rows = stats.map((stat, i) => {
    const plus = Math.round(stat.insertions * scale)
    const minus = Math.round(stat.deletions * scale)
    const parts: Span[] = [
      { text: ` ${stat.path.padEnd(nameWidth)} | ${String(totals[i]).padStart(countWidth)}` },
    ]
    if (plus + minus > 0) parts.push({ text: ' ' })
    if (plus > 0) parts.push({ text: '+'.repeat(plus), tone: 'success' })
    if (minus > 0) parts.push({ text: '-'.repeat(minus), tone: 'error' })
    return spans(...parts)
  })
  return [...rows, ...formatChangeSummary(stats)]
}

// ---------------------------------------------------------------- log

/** The refs a repository can show next to a commit in `git log`. */
export interface RefView {
  /** Checked-out branch, if any. */
  head?: string
  branches: Record<string, CommitId>
  remoteBranches?: Record<string, CommitId>
  /** Where `origin/HEAD` points, if known. */
  remoteHead?: string
}

/**
 * Real Git lists every ref pointing at the commit in reverse full-refname order
 * (so `origin/main, origin/HEAD, zed, main`), then pulls `HEAD -> <current>` to the front.
 */
export function decorations(refs: RefView, id: CommitId): Span[][] {
  const found: { fullName: string; parts: Span[] }[] = []
  for (const [name, tip] of Object.entries(refs.branches)) {
    if (tip === id && name !== refs.head) {
      found.push({ fullName: `refs/heads/${name}`, parts: [{ text: name, tone: 'branch' }] })
    }
  }
  const remoteBranches = refs.remoteBranches ?? {}
  for (const [name, tip] of Object.entries(remoteBranches)) {
    if (tip === id) {
      found.push({
        fullName: `refs/remotes/origin/${name}`,
        parts: [{ text: `origin/${name}`, tone: 'remote' }],
      })
    }
  }
  if (refs.remoteHead && remoteBranches[refs.remoteHead] === id) {
    found.push({
      fullName: 'refs/remotes/origin/HEAD',
      parts: [{ text: 'origin/HEAD', tone: 'remote' }],
    })
  }
  found.sort((a, b) => (a.fullName < b.fullName ? 1 : a.fullName > b.fullName ? -1 : 0))
  const result = found.map((entry) => entry.parts)
  if (refs.head && refs.branches[refs.head] === id) {
    result.unshift([
      { text: 'HEAD -> ', tone: 'head' },
      { text: refs.head, tone: 'branch' },
    ])
  }
  return result
}

function decorationSpans(refs: RefView | undefined, id: CommitId): Span[] {
  if (!refs) return []
  const found = decorations(refs, id)
  if (found.length === 0) return []
  const out: Span[] = [{ text: ' (', tone: 'hash' }]
  found.forEach((parts, i) => {
    if (i > 0) out.push({ text: ', ', tone: 'hash' })
    out.push(...parts)
  })
  out.push({ text: ')', tone: 'hash' })
  return out
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Mon Sep 14 09:00:00 2026 +0000`. Everyone at Inkwell lives in UTC, which keeps output stable. */
export function formatGitDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  return `${DAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${time} ${date.getUTCFullYear()} +0000`
}

export function subject(message: string): string {
  return message.split('\n')[0]
}

function commitHeader(commit: Commit, refs?: RefView): TerminalLine[] {
  const out: TerminalLine[] = [
    spans({ text: `commit ${commit.id}`, tone: 'hash' }, ...decorationSpans(refs, commit.id)),
  ]
  if (commit.parents.length > 1) {
    out.push(line(`Merge: ${commit.parents.map(shortId).join(' ')}`))
  }
  out.push(
    line(`Author: ${commit.author.name} <${commit.author.email}>`),
    line(`Date:   ${formatGitDate(commit.timestamp)}`),
    line(),
    ...commit.message.split('\n').map((text) => line(text ? `    ${text}` : ''))
  )
  return out
}

export function formatLog(
  commits: Commit[],
  options: { oneline?: boolean; refs?: RefView } = {}
): TerminalLine[] {
  if (options.oneline) {
    return commits.map((commit) =>
      spans(
        { text: shortId(commit.id), tone: 'hash' },
        ...decorationSpans(options.refs, commit.id),
        { text: ` ${subject(commit.message)}` }
      )
    )
  }
  return commits.flatMap((commit, i) => [
    ...(i > 0 ? [line()] : []),
    ...commitHeader(commit, options.refs),
  ])
}

export function formatShow(commit: Commit, diffs: FileDiff[], refs?: RefView): TerminalLine[] {
  return [
    ...commitHeader(commit, refs),
    ...(diffs.length > 0 ? [line(), ...formatDiff(diffs)] : []),
  ]
}

// ---------------------------------------------------------------- commit

export function formatCommitSummary(
  branch: string,
  commit: Commit,
  stats: FileStat[]
): TerminalLine[] {
  const root = commit.parents.length === 0 ? ' (root-commit)' : ''
  return [
    line(`[${branch}${root} ${shortId(commit.id)}] ${subject(commit.message)}`),
    ...formatChangeSummary(stats),
  ]
}

export function formatIdentityUnknown(): TerminalLine[] {
  return [
    line('Author identity unknown'),
    line(),
    line('*** Please tell me who you are.'),
    line(),
    line('Run'),
    line(),
    line('  git config --global user.email "you@example.com"'),
    line('  git config --global user.name "Your Name"'),
    line(),
    line("to set your account's default identity."),
    line('Omit --global to set the identity only in this repository.'),
    line(),
    line("fatal: unable to auto-detect email address (got 'you@your-laptop.(none)')", 'error'),
  ]
}
