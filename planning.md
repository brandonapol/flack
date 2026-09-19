# Flack — a Git tutorial disguised as a first day at work

A free, zero-setup, in-browser game that teaches non-developers (docs writers,
first) real-world Git through a fake first day at **Inkwell**: a fake chat
(**Flack**), a fake code host (**GitNub**), a fake editor, a fake terminal
with ~30 hardcoded commands, and — new in this revision — a visual sandbox
called the **Commit Lab** for the concepts that don't belong in a terminal.

Tracking issue: #39. Full issue breakdown: #1–#43. This document is the
source of truth those issues point back to; when it and an issue disagree,
this document wins and the issue should be updated to match.

> **Revision note (this pass):** the real-world workflow changed from
> trunk-based (commit straight to `main`) to **short-lived branch + PR,
> squash-merge**, and the plan for teaching merge/rebase/squash/cherry-pick
> changed from "type the commands" to "drag commits around a small graph and
> watch what happens." Conflicts are now **shown**, not hand-resolved with
> markers. See **How this maps to the issues** at the end for exactly what
> that moved.

## Tech stack

Vite + React 19 + TypeScript (`strict: true`), Zustand for state, CodeMirror 6
for the fake editor, `node-diff3` for 3-way merge, Playwright for E2E,
Vitest for unit/component tests. No backend — everything runs client-side and
deploys as a static site to GitHub Pages.

## Architecture

```
src/engine/{git,shell,story,lab}   pure TS, no React, no DOM
src/content                       world data, chapters, glossary, mentor FAQ
src/store                         Zustand wrapper, effect scheduler, persistence
src/features/{shell,instructions,flack,gitnub,editor,terminal,commit-lab}
e2e/                              Playwright specs
```

`src/engine/**` and `src/content/**` may not import React or anything from
`src/features`/`src/store` (enforced by an ESLint rule) — the simulation has
to be testable without a DOM.

Data flow: an action (`runCommand`, `saveFile`, `dragCommit`, …) goes through
`reduce(state, action) → { state, effects }`. Effects with a `delayMs` are
scheduled and applied later (simulates coworkers texting/pushing while you
work). The Zustand store is the only thing that talks to `localStorage`.

## The experience — layout

Three columns: **Instructions** (left, ~22%), a tabbed "desktop" in the
middle (~46%: Flack / GitNub / Editor), **Terminal** (right, ~32%). Below
~1100px wide, a full-screen "works best on a laptop" notice. Tabs lock/unlock
as the story progresses. The **Commit Lab** opens as an overlay/modal over
the desktop area rather than a fourth tab — it's a side-quest you're sent
into and returned from, not a place you live.

## Story, world and characters

**Inkwell** (fictional company). Remote repos on GitNub: `inkwell/docs-site`
(the real one, with a short prior history), `inkwell/website` and
`inkwell/old-wiki` (decoys). Characters: **Jordan Lee** (manager, welcomes
you), **Robin Okafor** (the friendly mentor you DM), **Sam Rivera** and
**Alex Chen** (coworkers whose scripted commits/PRs create the lessons).

Glossary and mentor FAQ content are unchanged in shape (see #19, #17) but gain
entries for branch, pull request, squash merge, rebase (concept), cherry-pick
(concept), and "what does a conflict mean" — see **Content additions** below.

## The fake Git model

Same core types as before (`FileTree`, `Commit`, `RemoteRepo`, `LocalRepo`,
`GitConfig`), deterministic fake ids and a fake clock. Operations:
`clone`, `stage`/`unstage`/`discard`, `commit`, `push`/`fetch`/`pull`
(fast-forward case in M1; 3-way merge case in M2), `getStatus`,
`diffWorking`/`diffStaged`, `log`.

**New for the branch+PR workflow:**

- Local and remote **branches**: `git switch -c <name>`, `git switch <name>`,
  branch name shown in the prompt.
- `git push -u origin <branch>` for a feature branch (not `main`).
- A `PullRequest` type on the remote: `{ id, branch, title, status: 'open' |
'needs-update' | 'has-conflicts' | 'merged', reviewer, comments }`.
- **Squash merge**: on "merge," the PR's commits collapse into a single new
  commit on `main` with one composed message — the model needs a
  `squashMerge(remote, pr) → newCommit` operation distinct from the old
  2-parent `merge` used for Chapter 5's "someone else's PR landed while you
  were working" case.
- **"Update branch"**: GitNub's real button (mirrors GitHub's own) that
  rebases (default) or merges the PR branch onto the current tip of `main`.
  This is the one place a rebase actually happens to the learner's own repo,
  and it's a click, not a typed command.

Merge conflicts are still modeled in the engine (line-level 3-way merge is
still how the sim decides _whether_ something conflicts — #36's engine work
is not wasted) but the **resolution UI is no longer the Editor's marker mode**
(see Commit Lab below). The engine only needs to expose "this would conflict"
and a resolved-file result for whichever side the learner picks; it does not
need to accept hand-edited buffers with markers still in them.

## Supported commands (terminal)

Unchanged foundation (#5, #10–#13): `help`, `hint`, `clear`, `history`,
`pwd`, `ls`, `cd`, `cat`, `open`/`code`, `git` (`--version`, `config`,
`clone`, `remote -v`, `branch`, `status`, `add`, `restore`, `diff`, `commit`,
`log`, `show`, `push`, `pull`, `fetch`, `merge` for the fast-forward/simple
3-way case).

**Added:** `git switch -c <branch>`, `git switch <branch>` (these were
previously stubbed as "Inkwell works trunk-based" in #11 — that stub is
removed; switching branches is now a Day-one command). `git switch main`.

**Deliberately not required as typed commands:** `git rebase`,
`git cherry-pick`, interactive `git rebase -i` (squash), `git rebase
--continue`/`--abort`. They exist as background flavor ("in real Git this is
called `git rebase`") inside Commit Lab captions, and Ask Robin can mention
the real syntax for people who want it, but no chapter goal requires typing
them. The GitNub "Update branch" button covers the one live rebase.

## The story engine

Unchanged (#6): chapters made of steps with goals, effects, hints, a
golden-path test harness. New action types: `switchBranch(name)`,
`openPullRequest(branch)`, `mergePullRequest(id, strategy)`,
`updateBranch(id)`, and Commit Lab's own `dragCommit(fromId, ontoId, mode)`.

Implementation notes (#6):

- The engine never imports content. `reduce(config, state, action)` takes a
  `GameConfig` (chapters, command registry, characters, `createRemotes`,
  mentor FAQ) that `src/content` provides and the store passes in.
- **Effects are plain data**, so delayed ones can be saved and still fire
  after a reload. A scripted push is `{ type: 'remoteCommit', slug, author,
message, edits: FileEdit[] }`, where `FileEdit` is `appendLine` /
  `replaceText` / `writeFile` / `deleteFile`, rather than a `change`
  function.
- `reduce` applies immediate effects itself and returns only the delayed
  ones. The store schedules those and dispatches `applyEffect` when they're
  due.
- Goals see the state _after_ the event. A `stepEntered` event fires when a
  step becomes current, so a goal that's already true completes at once.
- Steps can have an `apply(state, event)` hook for state changes that
  effects can't express, such as capturing the player's name.
- Chapter phases: `playing` → `complete` (summary) → `continueStory` →
  the next chapter, or `finished` after the last one.

## State, persistence and reset

Unchanged (#7): `localStorage` key `flack:v1`, debounced writes, schema
version + reset-on-mismatch, `?chapter=` dev jump, restart chapter / reset
everything.

## UI panels

### Terminal

Unchanged (#9): custom React terminal, not xterm.js. Colored tones, history,
paste handling, `aria-live` output.

### Editor

Unchanged core (#14): file tree, CodeMirror 6, save, dirty indicator,
read-only locked files, refresh-or-warn when the tree changes underneath you.
**Removed:** the conflict-marker mode from the old #40 (highlight
`<<<<<<<`/`=======`/`>>>>>>>`, Accept yours/theirs/both as buffer edits).
Conflicts are never something the learner edits by hand in this plan — see
Commit Lab.

### GitNub

Extends #15 with a **pull request page**, reusing most of what #35 already
scoped as "Later": after a feature-branch push, a "Compare & pull request"
banner appears; the PR page shows title, description, files changed,
Jordan/Robin's review (approves after a short delay), and:

- **Squash and merge** button (the default, recommended path) → collapses
  the branch's commits into one on `main`, offers "Delete branch."
- **Update branch** button, shown when `main` has moved since the branch was
  created — real rebase (or merge, GitNub's own default is configurable),
  visualized as a small before/after graph inline on the PR page.
- A **conflict banner** ("This branch has conflicts with the base branch")
  when the 3-way check fails, with a "See what's conflicting →" link that
  opens the Commit Lab pre-loaded with this PR's two branches, plus a
  simplified **Accept mine / Accept theirs / Keep both** choice once they've
  understood why — still a click, not a hand-edited file.

### Flack

Unchanged (#16, #17): channels, DMs, scripted messages with quick replies,
typing indicator, Ask Robin FAQ dropdown. FAQ gains entries for branches, PRs,
squash merge, and "what's a rebase, really" that all deep-link into opening
the Commit Lab in its free-play mode.

### Instructions panel

Unchanged shape (#18): chapter checklist, hints, "show me," docs links,
glossary tooltips, "Where are my changes?" diagram (#31) — that diagram
grows a fourth box for **Open PR** between "My commits" and "GitNub main."

### Commit Lab (new)

A small interactive canvas, not a terminal, not a text editor. This is the
answer to "I don't want them memorizing syntax — the goal is the concept
first."

**Visual model:** commits are draggable circles on one or two horizontal
lanes (one per branch), connected by lines to their parent(s), labeled with a
short message and author initials. No hashes, no CLI output — just shapes and
arrows.

**Interactions (drag-and-drop, each with a distinct visual result):**

- **Rebase**: drag a branch's line of commits so it starts from a later point
  on `main` — the commits visibly redraw further along the line and change
  color slightly (new copies), with a caption: "Rebase replays your commits
  on top of the latest work — same changes, new commits."
- **Merge**: drag one branch's tip onto another's — a new commit appears with
  two lines going back into it, caption: "Merge keeps both histories and adds
  a commit that joins them."
- **Squash**: drag several commits on the same branch into one — they
  visibly combine into a single circle with a composed message, caption:
  "Squash turns several small commits into one clean one before it joins
  `main`."
- **Cherry-pick**: drag a single commit from one branch onto another — a copy
  of just that one appears there, caption: "Cherry-pick copies one commit
  without bringing the rest of its branch along."
- **Conflict, shown not solved**: if two commits being combined touched the
  same lines, dragging them together shows a small "⚠ these changed the same
  spot" callout with a two-line diff snippet and three buttons — **Keep
  mine**, **Keep theirs**, **Keep both** — clicking one shows the resulting
  merged snippet. There is no marker syntax anywhere in this UI; the goal is
  recognizing _why_ a conflict happens and that resolving one is a choice
  between versions, not a crisis.

**Two modes:**

1. **Guided** — launched from a chapter step with a specific starting graph
   and a target graph to reach (e.g., "make history linear" → rebase is the
   only drag that satisfies it). Completing it fires a normal story goal
   event (`commitLabCompleted { mode, chapterId }`).
2. **Free play** — launched from Ask Robin or a GitNub conflict banner with
   whatever graph is relevant, no goal, an "I get it" button to close.

**Explicitly out of scope for Commit Lab:** typed commands, staging/index
concepts (that stays in the terminal/editor loop), anything requiring the
learner to remember flag names.

## Chapters (revised)

### M1 — Day one

- **Ch 0 — Welcome**: unchanged (#20).
- **Ch 1 — Get the repo**: unchanged, `git clone` (#20).
- **Ch 2 — Sign the list**: unchanged — edit, save, `git status`/`git diff`,
  name capture (#21). Still happens with `main` checked out; branching starts
  in Ch 3 once there's something to commit.
- **Ch 3 — Save it to GitNub** _(changed)_: `git switch -c <name>-team-list`
  → `git add` → `git commit -m` (identity gotcha kept, still a great
  teaching moment) → `git push -u origin <branch>` → GitNub shows "Compare &
  pull request" → open the PR → Jordan/Robin approve after a short delay →
  **Squash and merge** → "Delete branch" → back in the terminal, `git switch
main` → `git pull`. Ends with the learner's line showing up on `main` as
  one clean commit.
- **Ch 4 — Someone else changed it**: unchanged shape (#23) — Sam's change
  lands via the same branch+PR+squash path (scripted), learner pulls `main`
  and sees it. Reinforces that everyone, including Sam, uses PRs.
- **End of M1**: completion screen + cheat sheet, now headed **"The daily
  loop: branch, commit, push, PR, squash-merge"** instead of the old
  trunk-based loop (#24).

### M2 — Keeping in sync & the shape of history

- **Ch 5 — Look before you leap**: unchanged (#28) — `git fetch` /
  `git status` behind / fast-forward merge on `main`. Still needed: `main`
  moves whenever any PR merges, so checking before you start a new branch
  still matters.
- **Ch 6 — Two PRs, one file** _(changed from "Both of you changed
  things")_: the learner opens a PR; while it's waiting for review, Alex's
  PR (touching a different part of the same file) gets squash-merged first.
  GitNub shows **"This branch is out of date with the base branch"** on the
  learner's PR. Steps: notice the banner → click **Update branch** → GitNub
  shows a small before/after graph (this _is_ a rebase, named as such) →
  push is already done for them (the button does it) → merge. If Alex's
  change happens to touch the same lines (bonus/harder variant), the PR
  instead shows the conflict banner → **See what's conflicting →** opens
  Commit Lab guided mode → back on GitNub, resolve via Keep mine/theirs/both
  → merge.
- **Ch 7 — A tidier history** _(now mostly conceptual)_: Commit Lab guided
  mode, free of any specific PR — starting graph has a messy branch with 4
  small "wip" commits; goal is to reach a target graph two ways: (a) squash
  them into one, or (b) rebase them onto a moved `main` to keep history
  linear. Caption ties it back to the **Update branch** button they already
  used in Ch 6. No terminal commands in this chapter.
- **Ch 8 — Two people, one spot** _(soft conflict, revised)_: same
  low-stakes setup as before (#41 — everyone adds a tip to `docs/style-guide.md`)
  but the conflict now surfaces as GitNub's PR conflict banner rather than a
  local `git merge` conflict; resolution is Keep mine/theirs/**both** on the
  PR page (both is the right answer here, same as before), informed by a
  first trip through Commit Lab's conflict callout. Graduation screen at the
  end of M2, cheat sheet v2 gains "When your PR says it has conflicts" in a
  few clicks (no markers).
- **Optional bonus — Cherry-pick**: Commit Lab free play, "Sam made one
  useful fix on an otherwise messy branch — copy just that commit to `main`
  without the rest." Not gated behind a chapter; reachable from Ask Robin.

### Later

- **Undo toolbox** (#37) — unchanged, still useful (`git restore`,
  `git restore --staged`, `git commit --amend`), all local-only and CLI, no
  overlap with the new plan.
- **Rebase conflicts mid-drag** — if we ever want a "harder" Commit Lab
  challenge where the drag itself produces a conflict callout (not just PR
  merges), it's a small extension of the same component, not a new system.

## Content style guide

Unchanged (#19): they/them or names for characters, ≤30-word glossary
definitions, one canonical docs-links map, no real brand marks for GitNub/Flack.
Add to the glossary: **branch**, **pull request (PR)**, **squash merge**,
**base branch**, **rebase** (plain-language: "replaying your changes on top
of newer work"), **cherry-pick** ("copying one specific change to another
branch").

## Testing strategy

Unchanged shape (#1, #2, #6, #26, #32, #33, #34): unit tests on the pure
engine with real-Git output snapshots, component tests per feature, Playwright
E2E for full playthroughs, accessibility pass, playtest with 2–3 docs writers.
**Added:** component tests for Commit Lab's drag interactions (rebase, merge,
squash, cherry-pick, conflict-callout) verifying the resulting graph and the
emitted `commitLabCompleted` event, independent of any chapter — it should be
testable as a standalone sandbox.

## Accessibility

Unchanged (#32) for existing panels. Commit Lab needs its own pass since
drag-and-drop is the interaction: every drag action needs a keyboard
equivalent (e.g., select a commit, then a labeled menu of "Rebase onto here /
Merge with here / Squash into here / Cherry-pick to here"), and the resulting
graph change needs a text description for screen readers, not just a
redrawn diagram.

## Hosting and deployment

Unchanged (#25): GitHub Pages, `vite base: '/flack/'`, deploy on push to
`main`, HashRouter.

## Open questions (updated)

- [x] Hosting: GitHub Pages — decided (#38).
- [x] **Real workflow: short-lived branch + PR, squash-merge (recommended).**
      Supersedes the earlier trunk-based decision in #38.
- [x] **Conflicts and rebase/merge/squash/cherry-pick: taught visually via
      the Commit Lab, concept-first.** Actual hands-on rebase is limited to
      GitNub's "Update branch" button; conflicts are shown and chosen
      between (mine/theirs/both), never hand-edited with markers.
- [x] **Tools: Git Bash** — decided 2026-09-18 (#38). The terminal looks like
      Git Bash (#78), and tips lead with Ctrl shortcuts.
- [x] **Code host: GitLab** — decided 2026-09-18 (#38). "GitNub" keeps its name
      but speaks GitLab (#77): merge requests (`!4`), **Create merge request**,
      **Merge** with **Squash commits** on, **Rebase** for an MR that's behind
      (GitHub's "Update branch" above), **Resolve conflicts** →
      **Commit to source branch**, and GitLab docs links. Squash commits read
      `Title` + `See merge request inkwell/docs-site!4`.
      Learner-facing naming (#116): in-game text says **GitNub** everywhere,
      including the cheat sheet. The cheat sheet says once that GitNub is a
      stand-in for GitLab. "GitLab" otherwise appears only where it means the
      real product: 💡 real-world tips, the resolver's "Real GitLab labels
      these…" note, and docs links.
- [x] Completion tracking: none — decided (#38).
- [x] Fictional company name "Inkwell": kept — decided (#38).
- [x] Diverged `git pull`: Chapter 5 teaches the fast-forward catch-up; the
      engine supports a diverged pull, but no chapter requires it.

## How this maps to the issues

The issue tracker has been brought in line with this revision. What moved:

| Issue   | Was                                      | Now                                                            |
| ------- | ---------------------------------------- | -------------------------------------------------------------- |
| **#38** | workflow: trunk-based                    | workflow: branch + PR + squash-merge; concepts taught visually |
| **#35** | branches & PRs, "Later, only if adopted" | **M1** engine work: branches, `switch`, feature-branch push    |
| **#43** | —                                        | **new** — GitNub PR page, squash merge, Update branch button   |
| **#40** | Editor conflict mode (markers)           | **Commit Lab** — drag-and-drop commit graph                    |
| **#36** | merge conflicts: engine + terminal       | scoped down to the shared 3-way conflict **detection**         |
| **#42** | conflicts during a CLI rebase            | **closed** — superseded by #40 and #43                         |
| **#22** | Ch 3: add, commit, push to `main`        | Ch 3: branch, commit, push, PR, squash-merge                   |
| **#29** | Ch 6: push rejected, divergent pull      | Ch 6: out-of-date branch → **Update branch**                   |
| **#30** | Ch 7: `git rebase` in the terminal       | Ch 7: Commit Lab guided — squash & rebase, no terminal         |
| **#41** | Ch 8: local conflict, edit the markers   | Ch 8: PR conflict → Commit Lab → **Keep both**                 |
| **#11** | `git switch` stubbed "we're trunk-based" | stub removed; `git switch` is real, implemented in #35         |
| **#31** | four-box "Where are my changes?"         | five boxes — **Open PR** added                                 |

Smaller amendments live as comments on #13, #14, #15, #17, #19, #23, #24, #26
and #33. Unaffected and proceeding as written: #1–#10, #12, #16, #18, #20,
#21, #25, #27, #28, #32, #34, #37.

The build order in #39 now puts **#40 (Commit Lab) before the chapters that
use it** — it's a dependency of Ch 7 and Ch 8, not a garnish.

## Working on this across sessions

Definition of done for any PR against this plan: lint, typecheck, unit tests,
and build all pass in CI (#2). Chapter and engine issues should link back to
the specific section of this document they implement, the way the existing
issues already do — please keep that convention for any new issues filed off
the "Reconciling" list above.
