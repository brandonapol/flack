import { useMemo } from 'react'

import { renderInlineMarkdown, renderMarkdown } from './renderMarkdown'

interface MarkdownProps {
  source: string
  className?: string
  inline?: boolean
}

export function Markdown({ source, className, inline }: MarkdownProps) {
  const html = useMemo(
    () => (inline ? renderInlineMarkdown(source) : renderMarkdown(source)),
    [source, inline]
  )
  if (inline) return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
