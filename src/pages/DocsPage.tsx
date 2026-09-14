import { DocList } from '../components/DocList'
import { useI18n } from '../i18n/LanguageContext'

export function DocsPage() {
  const { t } = useI18n()

  return (
    <section id="docs" className="page page--docs" aria-labelledby="docs-title">
      <div className="page__body container">
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
      </div>
    </section>
  )
}
