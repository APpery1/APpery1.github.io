import { site } from '../content/site'
import { useI18n } from '../i18n/LanguageContext'

const NAV = [
  { href: '#about', key: 'nav.about' },
  { href: '#work', key: 'nav.work' },
  { href: '#contact', key: 'nav.contact' },
] as const

export function Topbar() {
  const { t } = useI18n()

  return (
    <header className="topbar">
      <div className="container topbar__inner">
        <a className="topbar__brand" href="#about">
          {site.nickname}
        </a>
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
