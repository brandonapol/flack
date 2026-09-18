export function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = above
    }
  }
  return previous[b.length]
}

/**
 * The closest candidate within an edit distance of 2, or undefined. A swap of two neighbouring
 * letters (`psuh`) counts as one edit, since that's the most common typo of all.
 */
export function suggest(input: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined
  let bestDistance = Infinity
  // Short words are close to everything: two edits turn `npm` into `vim`. Allow one there.
  const allowed = input.length <= 3 ? 1 : 2
  for (const candidate of candidates) {
    if (candidate === input) return candidate
    const distance = Math.min(levenshtein(input, candidate), transposedDistance(input, candidate))
    if (distance <= allowed && distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function transposedDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity
  const diffs: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i)
  if (diffs.length === 2 && diffs[1] === diffs[0] + 1) {
    const [i, j] = diffs
    if (a[i] === b[j] && a[j] === b[i]) return 1
  }
  return Infinity
}
