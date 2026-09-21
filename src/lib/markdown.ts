import { Marked, type Tokens } from 'marked'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

let linkCategory = ''

function rewriteHref(href: string): string {
  const local = href.match(/^(?:\.\/)?([^/\\]+)\.(md|txt|MD|TXT)$/)
  if (local) {
    const slug = encodeURIComponent(local[1])
    return linkCategory ? `#docs/${encodeURIComponent(linkCategory)}/${slug}` : `#docs/${slug}`
  }
  return href
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    link({ href, title, text, tokens, autolink }: Tokens.Link) {
      const url = rewriteHref(href ?? '')
      const isHttp = /^https?:\/\//i.test(url)
      const isLocal = url.startsWith('#') || url.startsWith('mailto:')
      const renderer = this as { parser: { parseInline: (tokens: TokenLike) => string } }
      const label = autolink ? escapeHtml(text) : renderer.parser.parseInline(tokens)
      if (!isHttp && !isLocal) {
        return `<code>${label}</code>`
      }
      const attrs = [
        `href="${escapeHtml(url)}"`,
        title ? `title="${escapeHtml(title)}"` : '',
        isHttp ? 'target="_blank" rel="noopener noreferrer"' : '',
      ]
        .filter(Boolean)
        .join(' ')
      return `<a ${attrs}>${label}</a>`
    },
    code({ text, lang, escaped }: Tokens.Code) {
      const language = lang?.trim() ?? ''
      const body = escaped ? text : escapeHtml(text)
      if (language.toLowerCase() === 'mermaid') {
        return `<pre class="mermaid">${body}</pre>`
      }
      const langAttr = language ? ` class="language-${escapeHtml(language)}"` : ''
      const label = language
        ? `<span class="doc-article__lang">${escapeHtml(language)}</span>`
        : ''
      return `<pre${language ? ` data-lang="${escapeHtml(language)}"` : ''}>${label}<code${langAttr}>${body}</code></pre>`
    },
  },
})

type TokenLike = Tokens.Link['tokens']

export function renderMarkdown(source: string, category?: string): string {
  const previous = linkCategory
  linkCategory = category ?? ''
  try {
    return marked.parse(source, { async: false }) as string
  } finally {
    linkCategory = previous
  }
}
