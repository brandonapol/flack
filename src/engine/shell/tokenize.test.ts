import { describe, expect, it } from 'vitest'

import { stripPrompt, tokenize } from './tokenize'

const argv = (input: string) => {
  const result = tokenize(input)
  if (!result.ok) throw new Error(result.error)
  return result.argv
}

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(argv('  git   status  ')).toEqual(['git', 'status'])
    expect(argv('')).toEqual([])
  })

  it('keeps double-quoted text together, including apostrophes', () => {
    expect(argv(`git commit -m "Add Robin's name"`)).toEqual([
      'git',
      'commit',
      '-m',
      "Add Robin's name",
    ])
  })

  it('keeps single-quoted text literal', () => {
    expect(argv(`git commit -m 'Say "hi"'`)).toEqual(['git', 'commit', '-m', 'Say "hi"'])
  })

  it('handles escaped quotes and joined quoted words', () => {
    expect(argv(`echo "a \\"b\\" c"`)).toEqual(['echo', 'a "b" c'])
    expect(argv(`echo it\\'s`)).toEqual(['echo', "it's"])
    expect(argv(`echo "a"'b'c`)).toEqual(['echo', 'abc'])
    expect(argv(`echo ""`)).toEqual(['echo', ''])
  })

  it('treats curly double quotes like straight ones', () => {
    expect(argv('git commit -m “Add Ada to team list”')).toEqual([
      'git',
      'commit',
      '-m',
      'Add Ada to team list',
    ])
  })

  it('reports an unterminated quote instead of guessing', () => {
    expect(tokenize('git commit -m "oops')).toEqual({
      ok: false,
      error: 'unterminated-quote',
      quote: '"',
    })
    expect(tokenize("git commit -m 'oops")).toMatchObject({ ok: false, quote: "'" })
  })

  it('strips a pasted prompt', () => {
    expect(argv('$ git status')).toEqual(['git', 'status'])
    expect(argv('~ $ ls')).toEqual(['ls'])
    expect(argv('~/docs-site (main ↑1) $ git push')).toEqual(['git', 'push'])
    expect(stripPrompt('git commit -m "$5 fix"')).toBe('git commit -m "$5 fix"')
  })
})
