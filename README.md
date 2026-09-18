# Flack

Flack is a free, zero-setup, in-browser game that teaches Git to people who don't write code
for a living — docs writers first. You play through a fake first day at a made-up company called
Inkwell: a fake chat app (Flack), a fake code host (GitNub), a fake editor and a fake terminal
that understands about thirty real Git commands. You learn the daily loop by typing it —
branch, commit, push, open a pull request, squash-merge — and you learn the scary-sounding
parts (merge, rebase, squash, cherry-pick, conflicts) by dragging commits around a small
visual sandbox called the Commit Lab, because those are concepts, not keystrokes.

Nothing is installed, nothing is real, and nothing you do can break anything.

**Play it:** https://brandonapol.github.io/flack/

## Running it

```sh
npm ci
npm run dev
```

Node 24 (see `.nvmrc`). The first time you run `npm run e2e`, install its browser with
`npx playwright install chromium`. Add `?fast=1` to the URL to shrink every scripted delay a
hundredfold (the E2E tests do).

Every push to `main` publishes the built site to the `github-pages` branch, which GitHub Pages
serves (`.github/workflows/pages-branch.yml`). Builds use the base path `/flack/`; set
`BASE_PATH` to host it somewhere else (`BASE_PATH=/ npm run build`). Routes live in the hash
(`/#/gitnub/…`), so deep links work on any static host.

| Script               | What it does                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Vite dev server                           |
| `npm run build`      | Typecheck and build to `dist/`            |
| `npm run preview`    | Serve the built site                      |
| `npm run lint`       | ESLint                                    |
| `npm run typecheck`  | TypeScript, no emit                       |
| `npm test`           | Vitest once (engine in Node, UI in jsdom) |
| `npm run test:watch` | Vitest in watch mode                      |
| `npm run format`     | Prettier                                  |
| `npm run e2e`        | Playwright playthrough against the build  |

## How the code is laid out

```
src/engine/{git,shell,story,lab}   the simulation — pure TypeScript, no React, no DOM
src/content                        the world: chapters, characters, glossary, docs links
src/store                          Zustand store, effect scheduler, persistence
src/features/*                     the UI panels
e2e/                               Playwright specs
```

`src/engine/**` and `src/content/**` may not import React or reach into `src/features` or
`src/store` — a lint rule enforces it. The simulation has to be testable without a browser.

## Plan

[`planning.md`](./planning.md) is the source of truth for what this is and what's left to build.
Work is tracked in [issues](https://github.com/brandonapol/flack/issues), with
[#39](https://github.com/brandonapol/flack/issues/39) as the roadmap.
