import { site } from '../content/site'
import { useI18n } from '../i18n/LanguageContext'
import type { PageId } from '../types'

const NAV = [
  { href: '#about', key: 'nav.about' },
  { href: '#work', key: 'nav.work' },
  { href: '#contact', key: 'nav.contact' },
] as const

type Props = {
  page: PageId
  docSlug?: string | null
  docCategory?: string | null
}

export function Topbar({ page, docSlug = null, docCategory = null }: Props) {
  const { t } = useI18n()
  const showBack = page === 'album' || page === 'docs'
  const backHref =
    page === 'docs' && docSlug && docCategory
      ? `#docs/${encodeURIComponent(docCategory)}`
      : page === 'docs' && (docSlug || docCategory)
        ? '#docs'
        : '#work'
  const backLabel =
    page === 'docs' && docSlug
      ? t('docs.back')
      : page === 'docs' && docCategory
        ? t('docs.backToCategories')
        : t('page.backToWork')

  return (
    <header className="topbar">
      <div className="container topbar__inner">
        {showBack ? (
          <a className="topbar__back" href={backHref} aria-label={backLabel}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : (
          <a className="topbar__brand" href="#about">
            {site.nickname}
          </a>
        )}
        <nav className="topbar__nav" aria-label={t('a11y.navLabel')}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {t(item.key)}
            </a>
          ))}
        </nav>
        <LangToggle />
      </div>
    </header>
  )
}

function LangToggle() {
  const { t, toggleLang, lang } = useI18n()
  return (
    <button
      className="lang-toggle"
      type="button"
      onClick={toggleLang}
      aria-label="Switch language / 切换语言"
      data-lang={lang}
    >
      {t('nav.langToggle')}
    </button>
  )
}
