/** Terminal output for `git merge`, `git rebase` and a diverged `git pull`, matching Git 2.46. */
import { line, type TerminalLine } from '../lines'
import { shortId } from './hash'
import type { ConflictedFile, MergeResult, RebaseResult } from './merge'
import { formatDiffstat, subject } from './output'

/** Flack never leaves a half-finished merge behind; this says so, and where conflicts go. */
const CONFLICT_NOTE = [
  line(),
  line(
    '💡 Flack put everything back the way it was, so nothing is half-merged. When two people change',
    'muted'
  ),
  line(
    '   the same lines, you choose what to keep on the merge request’s GitNub page instead.',
    'muted'
  ),
]

const MERGE_EDITOR_NOTE = [
  line(
    '💡 On your own computer, Git opens a text editor here for the merge message. It’s already filled',
    'muted'
  ),
  line('   in: type :wq and press Enter to accept it (that’s Vim for “save and quit”).', 'muted'),
]

function conflictLines(conflicts: ConflictedFile[], theirs: string): TerminalLine[] {
  return conflicts.flatMap(({ path, hunks }) => {
    const deletedTheirs = hunks.length === 1 && hunks[0].theirs.length === 0
    const deletedOurs = hunks.length === 1 && hunks[0].ours.length === 0
    if (deletedTheirs || deletedOurs) {
      const [deleted, modified] = deletedTheirs ? [theirs, 'HEAD'] : ['HEAD', theirs]
      return [
        line(
          `CONFLICT (modify/delete): ${path} deleted in ${deleted} and modified in ${modified}.`,
          'error'
        ),
      ]
    }
    return [
      line(`Auto-merging ${path}`),
      line(`CONFLICT (content): Merge conflict in ${path}`, 'error'),
    ]
  })
}

function wouldOverwrite(paths: string[]): TerminalLine[] {
  return [
    line(
      'error: Your local changes to the following files would be overwritten by merge:',
      'error'
    ),
    ...paths.map((path) => line(`\t${path}`, 'error')),
    line('Please commit your changes or stash them before you merge.', 'error'),
    line('Aborting', 'error'),
  ]
}

/** `theirs` is how the merged ref is named in messages: `origin/main`, a branch, a commit. */
export function formatMerge(result: MergeResult, theirs: string): TerminalLine[] {
  switch (result.kind) {
    case 'up-to-date':
      return [line('Already up to date.')]
    case 'fast-forward':
      return [
        line(`Updating ${shortId(result.from)}..${shortId(result.to)}`),
        line('Fast-forward'),
        ...formatDiffstat(result.stats),
      ]
    case 'merge':
      return [
        ...MERGE_EDITOR_NOTE,
        line("Merge made by the 'ort' strategy."),
        ...formatDiffstat(result.stats),
      ]
    case 'would-overwrite':
      return [...wouldOverwrite(result.paths), line('Merge with strategy ort failed.', 'error')]
    case 'conflict':
      return [
        ...conflictLines(result.conflicts, theirs),
        line('Automatic merge failed; fix conflicts and then commit the result.', 'error'),
        ...CONFLICT_NOTE,
      ]
  }
}

/** `verb` is `rebase` for `git rebase` and `pull with rebase` for `git pull --rebase`. */
export function formatRebase(
  result: RebaseResult,
  branch: string,
  verb: 'rebase' | 'pull with rebase' = 'rebase'
): TerminalLine[] {
  switch (result.kind) {
    case 'up-to-date':
      return [line(`Current branch ${branch} is up to date.`)]
    case 'fast-forward':
    case 'rebased':
      return [line(`Successfully rebased and updated refs/heads/${branch}.`)]
    case 'unstaged-changes':
      return [
        line(`error: cannot ${verb}: You have unstaged changes.`, 'error'),
        line('error: Please commit or stash them.', 'error'),
      ]
    case 'staged-changes':
      return [
        line(`error: cannot ${verb}: Your index contains uncommitted changes.`, 'error'),
        line('error: Please commit or stash them.', 'error'),
      ]
    case 'conflict':
      return [
        ...conflictLines(result.conflicts, shortId(result.commit.id)),
        line(
          `error: could not apply ${shortId(result.commit.id)}... ${subject(result.commit.message)}`,
          'error'
        ),
        ...CONFLICT_NOTE,
      ]
  }
}

/** `git pull --ff-only` (or `pull.ff only`) on a diverged branch. */
export function formatNotPossibleToFastForward(): TerminalLine[] {
  return [
    ...[
      "hint: Diverging branches can't be fast-forwarded, you need to either:",
      'hint:',
      'hint: \tgit merge --no-ff',
      'hint:',
      'hint: or:',
      'hint:',
      'hint: \tgit rebase',
      'hint:',
      'hint: Disable this message with "git config set advice.diverging false"',
    ].map((text) => line(text, 'muted')),
    line('fatal: Not possible to fast-forward, aborting.', 'error'),
  ]
}
