import { useLayoutEffect, useRef } from 'react'
import { DocList } from '../components/DocList'
import { DocView } from '../components/DocView'
import { useI18n } from '../i18n/LanguageContext'

type Props = {
  slug?: string | null
}

export function DocsPage({ slug = null }: Props) {
  const { t } = useI18n()
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [slug])

  return (
    <section
      id="docs"
      className={slug ? 'page page--docs page--doc-view' : 'page page--docs'}
      aria-labelledby={slug ? undefined : 'docs-title'}
    >
      <div className="page__body container" ref={bodyRef}>
        {slug ? (
          <DocView slug={slug} />
        ) : (
          <>
            <header className="subpage-head">
              <p className="section__kicker">
                <span>{t('docs.kicker')}</span>
                <span className="section__rule" aria-hidden="true" />
              </p>
              <h2 className="subpage-head__title" id="docs-title">
                {t('docs.title')}
              </h2>
              <p className="subpage-head__lead">{t('docs.lead')}</p>
            </header>
            <DocList />
          </>
        )}
      </div>
    </section>
  )
}
