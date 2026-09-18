import { describe, expect, it } from 'vitest'

import { clone } from '../engine/git/repo'
import { log } from '../engine/git/repo'
import { characters } from './characters'
import { createGameConfig } from './config'
import { ALLOWED_DOCS_HOSTS, DOCS } from './docsLinks'
import { findGlossaryEntry, GLOSSARY } from './glossary'
import { LAB_SCENARIOS } from './labScenarios'
import { GENERAL_QUESTIONS, MENTOR_FAQ } from './mentorFaq'
import {
  createRemotes,
  DOCS_SITE,
  OLD_WIKI,
  STYLE_GUIDE_TYPO,
  STYLE_GUIDE_VOICE_SENTENCE,
  WEBSITE,
  WELCOME_TYPO,
} from './world'

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

/** Gendered pronouns that would mean we've guessed a character's pronouns. */
const GENDERED = /\b(he|she|him|his|her|hers|himself|herself)\b/i

describe('docs links', () => {
  it('are https and on an allowlisted host', () => {
    for (const [key, link] of Object.entries(DOCS)) {
      const url = new URL(link.href)
      expect(url.protocol, key).toBe('https:')
      expect(ALLOWED_DOCS_HOSTS, key).toContain(url.hostname)
      expect(link.label.trim(), key).not.toBe('')
    }
  })
})

describe('glossary', () => {
  it('definitions are 30 words or fewer', () => {
    for (const entry of GLOSSARY) {
      expect(wordCount(entry.definition), entry.term).toBeLessThanOrEqual(30)
    }
  })

  it('has unique ids, terms and aliases, all lower case', () => {
    const words = GLOSSARY.flatMap((entry) => [entry.term, ...(entry.aliases ?? [])])
    expect(new Set(words).size).toBe(words.length)
    expect(new Set(GLOSSARY.map((entry) => entry.id)).size).toBe(GLOSSARY.length)
    for (const word of words) expect(word).toBe(word.toLowerCase())
  })

  it('links only to known docs', () => {
    for (const entry of GLOSSARY) {
      if (entry.docs) expect(DOCS[entry.docs], entry.term).toBeDefined()
    }
  })

  it('covers the branch and merge request workflow and has dropped trunk-based terms', () => {
    for (const term of [
      'branch',
      'merge request',
      'target branch',
      'squash merge',
      'rebase',
      'cherry-pick',
      'review',
    ]) {
      expect(findGlossaryEntry(term), term).toBeDefined()
    }
    expect(findGlossaryEntry('MR')?.term).toBe('merge request')
    // Writers who've used GitHub still find it.
    expect(findGlossaryEntry('pull request')?.term).toBe('merge request')
    expect(findGlossaryEntry('trunk')).toBeUndefined()
  })
})

describe('style', () => {
  it('never assigns pronouns to characters', () => {
    const texts = [
      ...GLOSSARY.map((entry) => entry.definition),
      ...Object.values(characters).map((c) => c.role),
      ...Object.values(createRemotes()).flatMap((repo) =>
        Object.values(repo.commits).flatMap((commit) => [
          commit.message,
          ...Object.values(commit.tree),
        ])
      ),
    ]
    for (const text of texts) expect(text).not.toMatch(GENDERED)
  })
})

describe('world', () => {
  const remotes = createRemotes()
  const docsSite = remotes[DOCS_SITE]
  const tree = docsSite.commits[docsSite.branches.main].tree

  it('has the docs repo and two decoys, one archived', () => {
    expect(Object.keys(remotes).sort()).toEqual([DOCS_SITE, OLD_WIKI, WEBSITE].sort())
    expect(remotes[OLD_WIKI].archived).toBe(true)
    expect(remotes[WEBSITE].archived).toBe(false)
  })

  it('docs-site has the starting files', () => {
    expect(Object.keys(tree).sort()).toEqual([
      'README.md',
      'docs/style-guide.md',
      'docs/welcome.md',
      'team.md',
    ])
    expect(tree['team.md']).toMatch(/- Jordan Lee\n- Robin Okafor\n$/)
  })

  it('docs-site has a short history of squash-merged merge requests, GitLab-style', () => {
    const history = log(docsSite.commits, docsSite.branches.main)
    expect(history).toHaveLength(4)
    expect(
      history.filter((commit) => /See merge request inkwell\/docs-site!\d+$/.test(commit.message))
    ).toHaveLength(3)
    expect(history.every((commit) => commit.parents.length <= 1)).toBe(true)
  })

  it('plants the typos and the spots later chapters need', () => {
    expect(tree['docs/welcome.md']).toContain(WELCOME_TYPO)
    expect(tree['docs/style-guide.md']).toContain(STYLE_GUIDE_TYPO)
    expect(tree['docs/style-guide.md']).toContain(STYLE_GUIDE_VOICE_SENTENCE)
    expect(tree['docs/style-guide.md']).toMatch(/## Team tips\n\n(- .+\n)+$/)
  })

  it('is deterministic and clones cleanly', () => {
    expect(createRemotes()[DOCS_SITE].branches.main).toBe(docsSite.branches.main)
    expect(clone(docsSite).working).toEqual(tree)
  })
})

describe('Ask Robin', () => {
  it('every general question exists, and answers link only to known docs', () => {
    for (const id of GENERAL_QUESTIONS) expect(MENTOR_FAQ[id], id).toBeDefined()
    const hrefs = Object.values(DOCS).map((link) => link.href)
    for (const [id, entry] of Object.entries(MENTOR_FAQ)) {
      expect(entry.question.trim(), id).not.toBe('')
      expect(entry.answer.trim(), id).not.toBe('')
      for (const [, href] of entry.answer.matchAll(/\]\((https?:[^)]+)\)/g)) {
        expect(hrefs, id).toContain(href)
      }
    }
  })

  it('answers avoid gendered pronouns and trunk-based language', () => {
    for (const entry of Object.values(MENTOR_FAQ)) {
      expect(entry.answer).not.toMatch(GENDERED)
      expect(entry.answer.toLowerCase()).not.toContain('trunk')
    }
  })

  it('covers the branch and merge request workflow', () => {
    for (const id of [
      'what-is-a-branch',
      'what-is-an-mr',
      'what-is-squash-merge',
      'out-of-date-branch',
      'what-is-a-rebase',
      'what-is-cherry-pick',
      'mr-has-conflicts',
      'what-are-markers',
      'delete-branch',
    ]) {
      expect(MENTOR_FAQ[id], id).toBeDefined()
    }
    expect(Object.values(MENTOR_FAQ).some((entry) => /merge --abort/.test(entry.answer))).toBe(
      false
    )
  })
})

describe('Commit Lab scenarios', () => {
  it('every lab link from Robin names a scenario that exists', () => {
    const linked = Object.values(MENTOR_FAQ).flatMap((entry) => (entry.lab ? [entry.lab] : []))
    expect(linked.length).toBeGreaterThan(0)
    for (const id of linked) expect(LAB_SCENARIOS[id], id).toBeDefined()
  })

  it('each scenario has main at the bottom and every branch tip in its graph', () => {
    for (const scenario of Object.values(LAB_SCENARIOS)) {
      expect(scenario.start.lanes[0], scenario.id).toBe('main')
      const ids = new Set(scenario.start.nodes.map((node) => node.id))
      for (const tip of Object.values(scenario.start.branches)) expect(ids.has(tip), tip).toBe(true)
      for (const node of scenario.start.nodes) {
        expect(scenario.start.lanes, node.id).toContain(node.lane)
        for (const parent of node.parents)
          expect(ids.has(parent), `${node.id} → ${parent}`).toBe(true)
      }
    }
  })
})

describe('GitLab vocabulary', () => {
  /** Every string reachable from a value: step text, hints, messages, effects, answers… */
  function strings(value: unknown, into: string[] = []): string[] {
    if (typeof value === 'string') into.push(value)
    else if (Array.isArray(value)) value.forEach((item) => strings(item, into))
    else if (value && typeof value === 'object')
      Object.values(value).forEach((v) => strings(v, into))
    return into
  }

  it('never says pull request, PR, Update branch or Squash and merge to the learner', () => {
    const config = createGameConfig()
    const text = strings([
      config.chapters,
      MENTOR_FAQ,
      LAB_SCENARIOS,
      GLOSSARY.map(({ term, definition }) => ({ term, definition })),
      DOCS,
      log(createRemotes()[DOCS_SITE].commits, createRemotes()[DOCS_SITE].branches.main),
    ])
      // Ids like `open-pr` and `pr-conflict` aren't shown to anyone.
      .filter((line) => !/^[a-z0-9-]+$/.test(line))
      // Saying what GitHub calls it is the one deliberate exception.
      .map((line) => line.replace(/\(?GitHub calls[^.)]*[.)]/g, ''))
      // …and GitLab's own docs page, which really is called that.
      .map((line) => line.replace(/Squash and merge \(GitLab\)/g, ''))
    const offenders = text.filter((line) =>
      /pull request|\bPRs?\b|Update branch|Squash and merge|\(#\d+\)/i.test(line)
    )
    expect(offenders).toEqual([])
  })
})
