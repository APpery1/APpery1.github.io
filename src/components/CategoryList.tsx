import { useI18n } from '../i18n/LanguageContext'
import { getCategories, getDocs } from '../lib/docs'
import { categoryHash } from '../lib/hash'

export function CategoryList() {
  const { t } = useI18n()
  const categories = getCategories()

  if (categories.length === 0) {
    return <p className="empty-state">{t('docs.categoriesEmpty')}</p>
  }

  return (
    <ul className="doc-list">
      {categories.map((category) => {
        const count = getDocs(category).length
        return (
          <li key={category}>
            <a className="doc-card cursor-target" href={categoryHash(category)}>
              <span className="doc-card__meta">
                <span className="doc-card__kicker">
                  {count} {t('docs.count')}
                </span>
              </span>
              <span className="doc-card__title">{category}</span>
              <span className="doc-card__open">
                {t('card.open')}
                <span aria-hidden="true"> →</span>
              </span>
              <span className="visually-hidden">{t('docs.openCategory')}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}
