import { describe, expect, it } from 'vitest'

import { plainText } from '../lines'
import { ada, docsSite, T0, TEAM_MD } from './__fixtures__/docsSite'
import { diffFile, diffStat, diffTreesDetailed } from './diff'
import { blobId, shortId } from './hash'
import {
  formatCommitSummary,
  formatDiff,
  formatDiffstat,
  formatGitDate,
  formatIdentityUnknown,
  formatLog,
  formatShow,
  formatStatus,
  formatStatusShort,
} from './output'
import { clone, commit, headCommit, headTree, log, stage } from './repo'
import { getStatus, type Status } from './status'
import type { LocalRepo } from './types'

const text = plainText

function status(partial: Partial<Status>): Status {
  return { branch: 'main', staged: [], unstaged: [], untracked: [], ...partial }
}

const upToDate = { name: 'origin/main', gone: false, ahead: 0, behind: 0 }

function withAda(local: LocalRepo): LocalRepo {
  return { ...local, working: { ...local.working, 'team.md': `${TEAM_MD}- Ada\n` } }
}

describe('git status', () => {
  it('clean, tracking origin/main', () => {
    // $ git status
    expect(text(formatStatus(status({ upstream: upToDate })))).toBe(
      `On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean`
    )
  })

  it('clean, no upstream', () => {
    expect(text(formatStatus(status({ branch: 'ada-team-list' })))).toBe(
      `On branch ada-team-list
nothing to commit, working tree clean`
    )
  })

  it('unstaged change', () => {
    expect(text(formatStatus(status({ unstaged: [{ path: 'team.md', kind: 'modified' }] })))).toBe(
      `On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   team.md

no changes added to commit (use "git add" and/or "git commit -a")`
    )
  })

  it('staged change plus an untracked file (ends on a blank line, like Git)', () => {
    expect(
      text(
        formatStatus(
          status({ staged: [{ path: 'team.md', kind: 'modified' }], untracked: ['notes.md'] })
        )
      )
    ).toBe(
      `On branch main
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tmodified:   team.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\tnotes.md
`
    )
  })

  it('ahead, behind and diverged', () => {
    expect(text(formatStatus(status({ upstream: { ...upToDate, ahead: 1 } })))).toBe(
      `On branch main
Your branch is ahead of 'origin/main' by 1 commit.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean`
    )
    expect(text(formatStatus(status({ upstream: { ...upToDate, behind: 2 } })))).toBe(
      `On branch main
Your branch is behind 'origin/main' by 2 commits, and can be fast-forwarded.
  (use "git pull" to update your local branch)

nothing to commit, working tree clean`
    )
    expect(text(formatStatus(status({ upstream: { ...upToDate, ahead: 1, behind: 1 } })))).toBe(
      `On branch main
Your branch and 'origin/main' have diverged,
and have 1 and 1 different commits each, respectively.
  (use "git pull" if you want to integrate the remote branch with yours)

nothing to commit, working tree clean`
    )
  })

  it('upstream gone', () => {
    expect(
      text(
        formatStatus(
          status({
            branch: 'ada-team-list',
            upstream: { ...upToDate, name: 'origin/ada-team-list', gone: true },
          })
        )
      )
    ).toBe(
      `On branch ada-team-list
Your branch is based on 'origin/ada-team-list', but the upstream is gone.
  (use "git branch --unset-upstream" to fixup)

nothing to commit, working tree clean`
    )
  })

  it('only untracked files', () => {
    expect(text(formatStatus(status({ untracked: ['notes.md'] })))).toContain(
      'nothing added to commit but untracked files present (use "git add" to track)'
    )
  })

  it('short format', () => {
    // $ git status -s
    // M  team.md
    //  M docs/welcome.md
    // ?? notes.md
    expect(
      text(
        formatStatusShort(
          status({
            staged: [{ path: 'team.md', kind: 'modified' }],
            unstaged: [{ path: 'docs/welcome.md', kind: 'modified' }],
            untracked: ['notes.md'],
          })
        )
      )
    ).toBe(' M docs/welcome.md\nM  team.md\n?? notes.md')
  })

  it('reads from the model', () => {
    const local = withAda(clone(docsSite()))
    expect(text(formatStatus(getStatus(local)))).toContain('\tmodified:   team.md')
  })
})

describe('git diff', () => {
  it('an appended line, with the hunk context Git would pick', () => {
    const local = withAda(clone(docsSite()))
    const diffs = diffTreesDetailed(local.index, local.working)
    // $ git diff
    expect(text(formatDiff(diffs))).toBe(
      `diff --git a/team.md b/team.md
index ${blobId(TEAM_MD)}..${blobId(`${TEAM_MD}- Ada\n`)} 100644
--- a/team.md
+++ b/team.md
@@ -4,3 +4,4 @@ Add your name to the bottom of the list to say hi!
 
 - Jordan Lee
 - Robin Okafor
+- Ada`
    )
  })

  it('new and deleted files, and missing trailing newlines', () => {
    // $ git diff --cached   (new file without a trailing newline)
    expect(text(formatDiff([diffFile('nn.md', undefined, 'a\nb')!]))).toBe(
      `diff --git a/nn.md b/nn.md
new file mode 100644
index 0000000..${blobId('a\nb')}
--- /dev/null
+++ b/nn.md
@@ -0,0 +1,2 @@
+a
+b
\\ No newline at end of file`
    )
    // $ git diff --cached   (deleted one-line file)
    expect(text(formatDiff([diffFile('one.md', 'one\n', undefined)!]))).toBe(
      `diff --git a/one.md b/one.md
deleted file mode 100644
index ${blobId('one\n')}..0000000
--- a/one.md
+++ /dev/null
@@ -1 +0,0 @@
-one`
    )
  })

  it('colours added and removed lines', () => {
    const lines = formatDiff([diffFile('a.md', 'x\n', 'y\n')!])
    expect(lines.find((l) => l.text === '-x')?.tone).toBe('error')
    expect(lines.find((l) => l.text === '+y')?.tone).toBe('success')
  })
})

describe('git commit output', () => {
  it('summary line for a modified file', () => {
    const local = withAda(clone(docsSite()))
    const staged = stage(local, ['.'])
    if (!staged.ok) throw new Error()
    const result = commit(staged.local, {
      message: 'Add Ada to team list',
      config: ada,
      timestamp: T0 + 600,
    })
    if (!result.ok) throw new Error()
    const stats = diffStat(headTree(local), result.commit.tree)
    // $ git commit -m "Add Ada to team list"
    // [main 60b1167] Add Ada to team list
    //  1 file changed, 1 insertion(+)
    expect(text(formatCommitSummary('main', result.commit, stats))).toBe(
      `[main ${shortId(result.commit.id)}] Add Ada to team list
 1 file changed, 1 insertion(+)`
    )
  })

  it('pluralises and lists created and deleted files', () => {
    // [main 71f374a] multi
    //  2 files changed, 3 insertions(+), 2 deletions(-)
    //  delete mode 100644 nn.md
    const stats = diffStat({ 'nn.md': 'a\nb', 't.md': 'x\n' }, { 't.md': 'x\na\nb\nc\n' })
    const fake = headCommit(clone(docsSite()))
    expect(text(formatCommitSummary('main', { ...fake, message: 'multi' }, stats))).toBe(
      `[main ${shortId(fake.id)}] multi
 2 files changed, 3 insertions(+), 2 deletions(-)
 delete mode 100644 nn.md`
    )
  })

  it('identity unknown matches real Git', () => {
    expect(text(formatIdentityUnknown())).toBe(
      `Author identity unknown

*** Please tell me who you are.

Run

  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"

to set your account's default identity.
Omit --global to set the identity only in this repository.

fatal: unable to auto-detect email address (got 'you@your-laptop.(none)')`
    )
  })
})

describe('diffstat', () => {
  it('pads names and counts', () => {
    // Fast-forward
    //  README.md | 1 +
    //  team.md   | 3 ++-
    const stats = diffStat(
      { 'README.md': 'a\n', 'team.md': 'a\nb\n' },
      { 'README.md': 'a\nb\n', 'team.md': 'a\nc\nd\n' }
    )
    expect(text(formatDiffstat(stats))).toBe(
      ` README.md | 1 +
 team.md   | 3 ++-
 2 files changed, 3 insertions(+), 1 deletion(-)`
    )
  })
})

describe('git log', () => {
  const remote = docsSite()
  const local = clone(remote)
  const commits = log(local.commits, local.branches.main)
  const [tip, first] = commits

  it('dates look like Git', () => {
    expect(formatGitDate(T0)).toBe('Mon Sep 14 09:00:00 2026 +0000')
  })

  it('full format with decorations', () => {
    // $ git log
    expect(text(formatLog(commits, { refs: local }))).toBe(
      `commit ${tip.id} (HEAD -> main, origin/main, origin/HEAD)
Author: Jordan Lee <jordan@inkwell.example>
Date:   Mon Sep 14 09:01:00 2026 +0000

    Add team list

commit ${first.id}
Author: Jordan Lee <jordan@inkwell.example>
Date:   Mon Sep 14 09:00:00 2026 +0000

    Start the docs site`
    )
  })

  it('oneline', () => {
    // $ git log --oneline
    expect(text(formatLog(commits, { oneline: true, refs: local }))).toBe(
      `${shortId(tip.id)} (HEAD -> main, origin/main, origin/HEAD) Add team list
${shortId(first.id)} Start the docs site`
    )
  })

  it('orders decorations like Git: HEAD first, then refs in reverse name order', () => {
    // aba3f38 (HEAD -> abc, origin/main, origin/HEAD, zed, main) r
    const refs = {
      head: 'abc',
      branches: { abc: tip.id, main: tip.id, zed: tip.id },
      remoteBranches: { main: tip.id },
      remoteHead: 'main',
    }
    expect(text(formatLog([tip], { oneline: true, refs }))).toBe(
      `${shortId(tip.id)} (HEAD -> abc, origin/main, origin/HEAD, zed, main) Add team list`
    )
  })

  it('show prints the commit and its diff', () => {
    const output = text(formatShow(tip, diffTreesDetailed(first.tree, tip.tree), local))
    expect(output).toContain(`commit ${tip.id} (HEAD -> main, origin/main, origin/HEAD)`)
    expect(output).toContain(
      '    Add team list\n\ndiff --git a/team.md b/team.md\nnew file mode 100644'
    )
  })
})
