import { useRef, useState } from 'react'
import { site } from '../content/site'
import type { MessageKey } from '../i18n/dict'
import { useI18n } from '../i18n/LanguageContext'
import { copyText } from '../lib/copyText'

type Copyable = {
  key: 'qq' | 'wechat'
  label: MessageKey
  value: string
}

const COPYABLES: Copyable[] = [
  { key: 'qq', label: 'contact.qqLabel', value: site.qq },
  { key: 'wechat', label: 'contact.wechatLabel', value: site.wechat },
]

export function ContactList() {
  const { t } = useI18n()
  const [copied, setCopied] = useState<'qq' | 'wechat' | null>(null)
  const [failed, setFailed] = useState<'qq' | 'wechat' | null>(null)
  const valueRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const clearTimer = useRef<number | null>(null)

  async function handleCopy(item: Copyable) {
    const ok = await copyText(item.value, valueRefs.current[item.key])
    if (clearTimer.current) {
      window.clearTimeout(clearTimer.current)
    }
    if (ok) {
      setFailed(null)
      setCopied(item.key)
    } else {
      setCopied(null)
      setFailed(item.key)
    }
    clearTimer.current = window.setTimeout(() => {
      setCopied(null)
      setFailed(null)
    }, 2000)
  }

  function copyLabel(item: Copyable) {
    if (copied === item.key) {
      return t('contact.copied')
    }
    if (failed === item.key) {
      return t('contact.copyManual')
    }
    return t('contact.copyAction')
  }

  return (
    <ul className="contact-list">
      <li className="contact-item">
        <span className="contact-item__label">{t('contact.emailLabel')}</span>
        <a className="contact-item__value" href={`mailto:${site.email}`}>
          {site.email}
        </a>
      </li>

      {COPYABLES.map((item) => (
        <li key={item.key} className="contact-item">
          <span className="contact-item__label">{t(item.label)}</span>
          <span
            className="contact-item__value"
            ref={(node) => {
              valueRefs.current[item.key] = node
            }}
          >
            {item.value}
          </span>
          <button
            type="button"
            className="contact-item__copy"
            onClick={() => {
              void handleCopy(item)
            }}
          >
            {copyLabel(item)}
          </button>
        </li>
      ))}

      <li className="contact-item">
        <span className="contact-item__label">{t('contact.githubLabel')}</span>
        <a
          className="contact-item__value"
          href={site.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {site.githubLabel}
        </a>
      </li>
    </ul>
  )
}
