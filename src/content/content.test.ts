import { describe, expect, it } from 'vitest'

import { clone } from '../engine/git/repo'
import { log } from '../engine/git/repo'
import { characters } from './characters'
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

  it('covers the branch and pull request workflow and has dropped trunk-based terms', () => {
    for (const term of [
      'branch',
      'pull request',
      'base branch',
      'squash merge',
      'rebase',
      'cherry-pick',
      'review',
    ]) {
      expect(findGlossaryEntry(term), term).toBeDefined()
    }
    expect(findGlossaryEntry('PR')?.term).toBe('pull request')
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

  it('docs-site has a short history of squash-merged pull requests', () => {
    const history = log(docsSite.commits, docsSite.branches.main)
    expect(history).toHaveLength(4)
    expect(
      history.filter((commit) => /\(#\d+\)$/.test(commit.message.split('\n')[0]))
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

  it('covers the branch and pull request workflow', () => {
    for (const id of [
      'what-is-a-branch',
      'what-is-a-pr',
      'what-is-squash-merge',
      'out-of-date-branch',
      'what-is-a-rebase',
      'what-is-cherry-pick',
      'pr-has-conflicts',
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
