/**
 * Terminal output is a list of lines. A line either has one tone, or is made of spans when parts
 * of it need different colours (a `git log --oneline` line has a yellow id and green branch names).
 * `text` is always the full plain text, so tests and screen readers never need to look at spans.
 */
export type Tone =
  | 'default'
  | 'error'
  | 'success'
  | 'muted'
  | 'staged'
  | 'unstaged'
  | 'hash'
  | 'meta'
  | 'head'
  | 'branch'
  | 'remote'
  | 'bold'
  | 'prompt'
  | 'prompt-user'
  | 'prompt-system'
  | 'prompt-path'
  | 'prompt-branch'

export interface Span {
  text: string
  tone?: Tone
}

export interface TerminalLine {
  text: string
  tone?: Tone
  spans?: Span[]
}

export function line(text = '', tone?: Tone): TerminalLine {
  return tone && tone !== 'default' ? { text, tone } : { text }
}

export function spans(...parts: Span[]): TerminalLine {
  return { text: parts.map((part) => part.text).join(''), spans: parts }
}

export function lines(text: string, tone?: Tone): TerminalLine[] {
  return text.split('\n').map((part) => line(part, tone))
}

export function plainText(output: TerminalLine[]): string {
  return output.map((entry) => entry.text).join('\n')
}
