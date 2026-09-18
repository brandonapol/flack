import { line, type TerminalLine } from '../lines'
import { shortId } from './hash'
import { formatDiffstat } from './output'
import { GITNUB_HOST, remoteUrl } from './repo'
import type { FetchResult, PullResult, PushResult, RefUpdate } from './sync'

/** Real Git pads the summary column to 2×7+3 characters. */
const SUMMARY_WIDTH = 17

function refLine(flag: string, summary: string, rest: string, tone?: 'error'): TerminalLine {
  return line(` ${flag} ${summary.padEnd(SUMMARY_WIDTH)} ${rest}`, tone)
}

function rangeSummary(update: RefUpdate): string {
  if (!update.from) return '[new branch]'
  const dots = update.forced ? '...' : '..'
  return `${shortId(update.from)}${dots}${shortId(update.to)}`
}

function flagFor(update: RefUpdate): string {
  if (!update.from) return '*'
  return update.forced ? '+' : ' '
}

function sendProgress(objects: number): TerminalLine[] {
  const total = Math.max(objects, 3)
  const written = Math.max(total - 2, 3)
  const bytes = 96 * written + 24
  return [
    line(`Enumerating objects: ${total}, done.`, 'muted'),
    line(`Counting objects: 100% (${total}/${total}), done.`, 'muted'),
    line('Delta compression using up to 8 threads', 'muted'),
    line(`Compressing objects: 100% (2/2), done.`, 'muted'),
    line(
      `Writing objects: 100% (${written}/${written}), ${bytes} bytes | ${bytes}.00 KiB/s, done.`,
      'muted'
    ),
    line(`Total ${written} (delta 1), reused 0 (delta 0), pack-reused 0`, 'muted'),
  ]
}

function receiveProgress(objects: number): TerminalLine[] {
  const total = Math.max(objects, 3)
  const bytes = 96 * total + 2
  return [
    line(`remote: Enumerating objects: ${total + 2}, done.`, 'muted'),
    line(`remote: Counting objects: 100% (${total + 2}/${total + 2}), done.`, 'muted'),
    line('remote: Compressing objects: 100% (1/1), done.', 'muted'),
    line(`remote: Total ${total} (delta 1), reused 0 (delta 0), pack-reused 0`, 'muted'),
    line(
      `Unpacking objects: 100% (${total}/${total}), ${bytes} bytes | ${bytes}.00 KiB/s, done.`,
      'muted'
    ),
  ]
}

// ---------------------------------------------------------------- push

export function formatPush(result: PushResult, slug: string): TerminalLine[] {
  const url = remoteUrl(slug)
  switch (result.kind) {
    case 'up-to-date':
      return [
        line('Everything up-to-date'),
        ...(result.setUpstream ? [trackingLine(result.branch, result.remoteBranch)] : []),
      ]

    case 'pushed': {
      const out = sendProgress(result.objects)
      if (!result.update.from && result.remoteBranch !== 'main') {
        out.push(
          line('remote: '),
          line(`remote: To create a merge request for ${result.remoteBranch}, visit:`),
          line(
            `remote:   ${GITNUB_HOST}/${slug}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${result.remoteBranch}`
          ),
          line('remote: ')
        )
      }
      out.push(
        line(`To ${url}`),
        refLine(
          flagFor(result.update),
          rangeSummary(result.update),
          `${result.branch} -> ${result.remoteBranch}`
        )
      )
      if (result.setUpstream) out.push(trackingLine(result.branch, result.remoteBranch))
      return out
    }

    case 'rejected': {
      const refs = `${result.branch} -> ${result.remoteBranch}`
      const hints =
        result.reason === 'fetch-first'
          ? [
              'hint: Updates were rejected because the remote contains work that you do not',
              'hint: have locally. This is usually caused by another repository pushing to',
              'hint: the same ref. If you want to integrate the remote changes, use',
              "hint: 'git pull' before pushing again.",
            ]
          : [
              'hint: Updates were rejected because the tip of your current branch is behind',
              'hint: its remote counterpart. If you want to integrate the remote changes,',
              "hint: use 'git pull' before pushing again.",
            ]
      return [
        line(`To ${url}`),
        refLine(
          '!',
          '[rejected]',
          `${refs} (${result.reason === 'fetch-first' ? 'fetch first' : 'non-fast-forward'})`,
          'error'
        ),
        line(`error: failed to push some refs to '${url}'`, 'error'),
        ...hints.map((text) => line(text, 'muted')),
        line("hint: See the 'Note about fast-forwards' in 'git push --help' for details.", 'muted'),
      ]
    }

    case 'no-upstream':
      return [
        line(`fatal: The current branch ${result.branch} has no upstream branch.`, 'error'),
        line('To push the current branch and set the remote as upstream, use'),
        line(),
        line(`    git push --set-upstream origin ${result.branch}`),
        line(),
        line('To have this happen automatically for branches without a tracking'),
        line("upstream, see 'push.autoSetupRemote' in 'git help config'."),
        line(),
      ]

    case 'unknown-branch':
      return [
        line(`error: src refspec ${result.branch} does not match any`, 'error'),
        line(`error: failed to push some refs to '${url}'`, 'error'),
      ]
  }
}

function trackingLine(branch: string, remoteBranch: string): TerminalLine {
  return line(`branch '${branch}' set up to track 'origin/${remoteBranch}'.`)
}

// ---------------------------------------------------------------- fetch

export function formatFetch(result: FetchResult, slug: string): TerminalLine[] {
  if (result.updates.length === 0 && result.pruned.length === 0) return []
  const width = Math.max(10, ...result.updates.map((update) => update.branch.length))
  return [
    ...(result.updates.length > 0 ? receiveProgress(result.objects) : []),
    line(`From ${GITNUB_HOST}/${slug}`),
    ...result.pruned.map((branch) =>
      refLine('-', '[deleted]', `${'(none)'.padEnd(width)} -> origin/${branch}`)
    ),
    ...result.updates.map((update) =>
      refLine(
        flagFor(update),
        rangeSummary(update),
        `${update.branch.padEnd(width)} -> origin/${update.branch}${update.forced ? '  (forced update)' : ''}`
      )
    ),
  ]
}

// ---------------------------------------------------------------- pull

export function formatDivergentHint(): TerminalLine[] {
  return [
    ...[
      'hint: You have divergent branches and need to specify how to reconcile them.',
      'hint: You can do so by running one of the following commands sometime before',
      'hint: your next pull:',
      'hint:',
      'hint:   git config pull.rebase false  # merge',
      'hint:   git config pull.rebase true   # rebase',
      'hint:   git config pull.ff only       # fast-forward only',
      'hint:',
      'hint: You can replace "git config" with "git config --global" to set a default',
      'hint: preference for all repositories. You can also pass --rebase, --no-rebase,',
      'hint: or --ff-only on the command line to override the configured default per',
      'hint: invocation.',
    ].map((text) => line(text, 'muted')),
    line('fatal: Need to specify how to reconcile divergent branches.', 'error'),
  ]
}

export function formatPull(result: PullResult, slug: string): TerminalLine[] {
  const fetched = 'fetch' in result ? formatFetch(result.fetch, slug) : []
  switch (result.kind) {
    case 'up-to-date':
      return [...fetched, line('Already up to date.')]

    case 'fast-forward':
      return [
        ...fetched,
        line(`Updating ${shortId(result.from)}..${shortId(result.to)}`),
        line('Fast-forward'),
        ...formatDiffstat(result.stats),
      ]

    case 'would-overwrite':
      return [
        ...fetched,
        line(`Updating ${shortId(result.from)}..${shortId(result.to)}`),
        line(
          'error: Your local changes to the following files would be overwritten by merge:',
          'error'
        ),
        ...result.paths.map((path) => line(`\t${path}`, 'error')),
        line('Please commit your changes or stash them before you merge.', 'error'),
        line('Aborting', 'error'),
      ]

    case 'untracked-would-overwrite':
      return [
        ...fetched,
        line(`Updating ${shortId(result.from)}..${shortId(result.to)}`),
        line(
          'error: The following untracked working tree files would be overwritten by merge:',
          'error'
        ),
        ...result.paths.map((path) => line(`\t${path}`, 'error')),
        line('Please move or remove them before you merge.', 'error'),
        line('Aborting', 'error'),
      ]

    case 'diverged':
      return [...fetched, ...formatDivergentHint()]

    case 'no-tracking':
      return [
        line('There is no tracking information for the current branch.'),
        line('Please specify which branch you want to merge with.'),
        line('See git-pull(1) for details.'),
        line(),
        line('    git pull <remote> <branch>'),
        line(),
        line('If you wish to set tracking information for this branch you can do so with:'),
        line(),
        line(`    git branch --set-upstream-to=origin/<branch> ${result.branch}`),
        line(),
      ]

    case 'no-such-ref':
      return [
        ...fetched,
        line(
          "Your configuration specifies to merge with the ref 'refs/heads/" +
            `${result.remoteBranch}'`,
          'error'
        ),
        line('from the remote, but no such ref was fetched.', 'error'),
      ]
  }
}
