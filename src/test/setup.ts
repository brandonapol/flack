import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup()
})

// jsdom has no layout. CodeMirror measures text ranges, so give it empty rectangles.
if (typeof Range !== 'undefined') {
  const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getClientRects ??= emptyRects
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
}
