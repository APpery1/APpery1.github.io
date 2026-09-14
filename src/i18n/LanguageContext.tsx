import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { dict, type Lang, type MessageKey } from './dict'

const STORAGE_KEY = 'appery-lang'
const DEFAULT_LANG: Lang = 'zh'

type I18nValue = {
  lang: Lang
  t: (key: MessageKey) => string
  toggleLang: () => void
}

const I18nContext = createContext<I18nValue | null>(null)

function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') {
      return stored
    }
  } catch {
    /* privacy mode */
  }
  return DEFAULT_LANG
}

function applyDocumentLang(lang: Lang, title: string, description: string) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  document.title = title
  const meta = document.querySelector('meta[name="description"]')
  if (meta) {
    meta.setAttribute('content', description)
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readStoredLang)

  const t = useCallback(
    (key: MessageKey) => dict[lang][key] || dict.zh[key] || key,
    [lang],
  )

  const toggleLang = useCallback(() => {
    setLang((current) => (current === 'zh' ? 'en' : 'zh'))
  }, [])

  useEffect(() => {
    applyDocumentLang(lang, dict[lang]['page.title'], dict[lang]['page.description'])
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* session-only */
    }
  }, [lang])

  const value = useMemo(() => ({ lang, t, toggleLang }), [lang, t, toggleLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used within LanguageProvider')
  }
  return value
}
