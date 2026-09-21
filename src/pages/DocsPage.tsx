import { useLayoutEffect, useRef } from 'react'
import { CategoryList } from '../components/CategoryList'
import { DocList } from '../components/DocList'
import { DocView } from '../components/DocView'
import { useI18n } from '../i18n/LanguageContext'
import { getCategories, getDocs, getReadableDocs } from '../lib/docs'

type Props = {
  category?: string | null
  slug?: string | null
}

export function DocsPage({ category = null, slug = null }: Props) {
  const { t } = useI18n()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const categories = getCategories()
  const knownCategory = category && categories.includes(category) ? category : null
  const fallbackDoc =
    !knownCategory && category && !slug
      ? getReadableDocs().find((doc) => doc.slug === category)
      : undefined
  const viewCategory = knownCategory ?? fallbackDoc?.category ?? null
  const viewSlug = slug ?? fallbackDoc?.slug ?? null

  useLayoutEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [viewCategory, viewSlug])

  const missingCategory = Boolean(category) && !knownCategory && !fallbackDoc
  const viewingDoc = Boolean(viewSlug)

  return (
    <section
      id="docs"
      className={viewingDoc ? 'page page--docs page--doc-view' : 'page page--docs'}
      aria-labelledby={viewingDoc ? undefined : 'docs-title'}
    >
      <div className="page__body container" ref={bodyRef}>
        {viewingDoc && viewSlug ? (
          <DocView category={viewCategory} slug={viewSlug} />
        ) : missingCategory ? (
          <>
            <a className="doc-view__back" href="#docs">
              ← {t('docs.backToCategories')}
            </a>
            <p className="empty-state">{t('docs.missingCategory')}</p>
          </>
        ) : knownCategory ? (
          <>
            <header className="subpage-head">
              <p className="section__kicker">
                <span>{t('docs.kicker')}</span>
                <span className="section__rule" aria-hidden="true" />
              </p>
              <h2 className="subpage-head__title" id="docs-title">
                {knownCategory}
              </h2>
              <p className="subpage-head__lead">
                {getDocs(knownCategory).length} {t('docs.count')}
              </p>
            </header>
            <DocList category={knownCategory} />
          </>
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
            <CategoryList />
          </>
        )}
      </div>
    </section>
  )
}
