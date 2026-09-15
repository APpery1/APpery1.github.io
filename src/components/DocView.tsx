import { useMemo } from 'react'
import { useI18n } from '../i18n/LanguageContext'
import { getReadableDocs, splitDocTitle } from '../lib/docs'
import { docHash } from '../lib/hash'
import { renderMarkdown } from '../lib/markdown'

type Props = {
  slug: string
}

export function DocView({ slug }: Props) {
  const { t } = useI18n()
  const docs = getReadableDocs()
  const index = docs.findIndex((doc) => doc.slug === slug)
  const doc = index >= 0 ? docs[index] : undefined
  const prev = index > 0 ? docs[index - 1] : undefined
  const next = index >= 0 && index < docs.length - 1 ? docs[index + 1] : undefined

  const html = useMemo(() => {
    if (!doc?.content) return ''
    if (doc.kind === 'txt') return ''
    return renderMarkdown(doc.content)
  }, [doc])

  if (!doc) {
    return (
      <div className="doc-view">
        <a className="doc-view__back" href="#docs">
          ← {t('docs.back')}
        </a>
        <p className="empty-state">{t('docs.missing')}</p>
      </div>
    )
  }

  const { name } = splitDocTitle(doc.title)

  return (
    <div className="doc-view">
      <header className="doc-view__bar">
        <a className="doc-view__back" href="#docs">
          ← {t('docs.back')}
        </a>
        <p className="doc-view__kicker">
          <span>{doc.description}</span>
          <span className="section__rule" aria-hidden="true" />
        </p>
      </header>

      <article className="doc-article" aria-label={name}>
        {doc.kind === 'txt' ? (
          <pre className="doc-article__plain">{doc.content}</pre>
        ) : (
          <div className="doc-article__body" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </article>

      {prev || next ? (
        <nav className="doc-view__pager" aria-label={t('docs.pager')}>
          {prev ? (
            <a className="doc-view__page-link cursor-target" href={docHash(prev.slug)}>
              <span className="doc-view__page-label">{t('docs.prev')}</span>
              <span className="doc-view__page-title">{splitDocTitle(prev.title).name}</span>
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a className="doc-view__page-link cursor-target doc-view__page-link--next" href={docHash(next.slug)}>
              <span className="doc-view__page-label">{t('docs.next')}</span>
              <span className="doc-view__page-title">{splitDocTitle(next.title).name}</span>
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}
