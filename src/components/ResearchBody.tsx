import { useEffect, useMemo, useRef } from 'react'
import source from '../content/research.md?raw'
import { renderMarkdown } from '../lib/markdown'

export function ResearchBody() {
  const html = useMemo(() => renderMarkdown(source), [])
  const articleRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid'))
    if (nodes.length === 0) return

    let cancelled = false
    const light = window.matchMedia('(prefers-color-scheme: light)').matches

    void import('mermaid')
      .then(async (mod) => {
        if (cancelled) return
        const mermaid = mod.default
        mermaid.initialize({
          startOnLoad: false,
          theme: light ? 'neutral' : 'dark',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        })
        await mermaid.run({ nodes })
      })
      .catch(() => {
        /* keep mermaid source as fallback */
      })

    return () => {
      cancelled = true
    }
  }, [html])

  return (
    <article className="doc-article research-article" ref={articleRef}>
      <div className="doc-article__body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
