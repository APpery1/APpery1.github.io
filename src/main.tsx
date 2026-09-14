import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { dict, type Lang } from './i18n/dict'
import { LanguageProvider } from './i18n/LanguageContext'
import './styles/global.css'

function readLang(): Lang {
  try {
    const stored = window.localStorage.getItem('appery-lang')
    if (stored === 'zh' || stored === 'en') {
      return stored
    }
  } catch {
    /* privacy mode */
  }
  return 'zh'
}

const initialLang = readLang()
document.documentElement.lang = initialLang === 'zh' ? 'zh-CN' : 'en'
document.title = dict[initialLang]['page.title']
const description = document.querySelector('meta[name="description"]')
if (description) {
  description.setAttribute('content', dict[initialLang]['page.description'])
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root is missing')
}

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
