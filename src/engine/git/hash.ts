function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * A deterministic 40-hex-digit id. Not cryptographic, not Git's real object hash — it only has to
 * look right and never collide across the few dozen objects a playthrough creates.
 */
export function fakeHash(input: string): string {
  let out = ''
  for (let round = 1; round <= 5; round++) {
    out += fnv1a(input, 0x811c9dc5 ^ Math.imul(round, 0x9e3779b9))
      .toString(16)
      .padStart(8, '0')
  }
  return out
}

export function shortId(id: string): string {
  return id.slice(0, 7)
}

export function blobId(content: string | undefined): string {
  return content === undefined ? '0000000' : shortId(fakeHash(`blob\0${content}`))
}
