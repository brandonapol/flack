export type TokenizeResult =
  { ok: true; argv: string[] } | { ok: false; error: 'unterminated-quote'; quote: '"' | "'" }

/** A pasted prompt such as `$ `, `~ $ ` or `~/docs-site (main ↑1) $ `. */
const PROMPT_PREFIX = /^(?:~[^\s$]*(?: \([^)]*\))? )?\$\s+/

export function stripPrompt(line: string): string {
  return line.trim().replace(PROMPT_PREFIX, '')
}

/**
 * Shell-style splitting: whitespace separates words, single quotes are literal, double quotes
 * allow `\"` and `\\`, and a backslash outside quotes escapes the next character. Curly double
 * quotes (“like these”) count as straight ones, because people paste from documents.
 */
export function tokenize(input: string): TokenizeResult {
  const line = stripPrompt(input).replace(/[“”]/g, '"')
  const argv: string[] = []
  let current = ''
  let inWord = false
  let quote: '"' | "'" | undefined

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (quote === "'") {
      if (char === "'") quote = undefined
      else current += char
      continue
    }

    if (quote === '"') {
      if (char === '"') quote = undefined
      else if (char === '\\' && (line[i + 1] === '"' || line[i + 1] === '\\')) current += line[++i]
      else current += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      inWord = true
    } else if (char === '\\' && i + 1 < line.length) {
      current += line[++i]
      inWord = true
    } else if (/\s/.test(char)) {
      if (inWord) argv.push(current)
      current = ''
      inWord = false
    } else {
      current += char
      inWord = true
    }
  }

  if (quote) return { ok: false, error: 'unterminated-quote', quote }
  if (inWord) argv.push(current)
  return { ok: true, argv }
}
