import { useI18n } from '../i18n/LanguageContext'
import { getDocs, splitDocTitle } from '../lib/docs'

function isExternal(kind: string): boolean {
  return kind === 'pdf' || kind === 'html'
}

export function DocList() {
  const { t } = useI18n()
  const docs = getDocs()

  if (docs.length === 0) {
    return <p className="empty-state">{t('docs.empty')}</p>
  }

  return (
    <ul className="doc-list">
      {docs.map((doc) => {
        const { index, name } = splitDocTitle(doc.title)
        const external = isExternal(doc.kind)
        const inner = (
          <>
            <span className="doc-card__meta">
              {index ? <span className="doc-card__index">{index}</span> : null}
              <span className="doc-card__kicker">{doc.description}</span>
            </span>
            <span className="doc-card__title">{name}</span>
            {doc.date ? <time className="doc-card__date">{doc.date}</time> : null}
            {doc.href ? (
              <span className="doc-card__open">
                {t('card.open')}
                <span aria-hidden="true"> →</span>
              </span>
            ) : null}
          </>
        )

        return (
          <li key={doc.slug}>
            {doc.href ? (
              <a
                className="doc-card cursor-target"
                href={doc.href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
              >
                {inner}
                <span className="visually-hidden">{t('docs.open')}</span>
              </a>
            ) : (
              <div className="doc-card">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
