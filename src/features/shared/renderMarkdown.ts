import { Marked } from 'marked'

const marked = new Marked({ gfm: true, breaks: false })

marked.use({
  renderer: {
    // Everything rendered is our content or the learner's own edits, but raw HTML is still dropped
    // rather than trusted.
    html: () => '',
    link({ href, text }) {
      const safe = /^(https?:|mailto:|#|\/)/.test(href) ? href : '#'
      const external = safe.startsWith('http')
      return `<a href="${escapeAttr(safe)}"${external ? ' target="_blank" rel="noreferrer"' : ''}>${text}</a>`
    },
  },
})

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false })
}

export function renderInlineMarkdown(source: string): string {
  return marked.parseInline(source, { async: false })
}
