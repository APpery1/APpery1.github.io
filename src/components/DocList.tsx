import { useI18n } from '../i18n/LanguageContext'
import { getDocs } from '../lib/docs'

export function DocList() {
  const { t } = useI18n()
  const docs = getDocs()

  if (docs.length === 0) {
    return <p className="empty-state">{t('docs.empty')}</p>
  }

  return (
    <ul className="doc-list">
      {docs.map((doc) => {
        const inner = (
          <>
            <span className="doc__top">
              <span className="doc__title">{doc.title}</span>
              {doc.date ? <time className="doc__date">{doc.date}</time> : null}
            </span>
            <span className="doc__desc">{doc.description}</span>
          </>
        )

        return (
          <li key={`${doc.title}-${doc.href ?? ''}`} className="doc">
            {doc.href ? (
              <a
                className="doc__link"
                href={doc.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
                <span className="visually-hidden">{t('docs.open')}</span>
              </a>
            ) : (
              <div className="doc__link">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
