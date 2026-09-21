import { useEffect, useRef, useState } from 'react'
import { ProjectList } from '../components/ProjectList'
import { ResearchBody } from '../components/ResearchBody'
import type { MessageKey } from '../i18n/dict'
import { useI18n } from '../i18n/LanguageContext'
import { getCategories, getDocs } from '../lib/docs'
import { getPhotos } from '../lib/photos'
import { getRepos } from '../lib/repos'
import type { PanelId } from '../types'

type CardId = PanelId | 'docs' | 'album'

type Card = {
  id: CardId
  kicker: MessageKey
  title: MessageKey
  lead: MessageKey
  href?: '#docs' | '#album'
}

const CARDS: Card[] = [
  { id: 'projects', kicker: 'projects.kicker', title: 'projects.title', lead: 'projects.lead' },
  { id: 'research', kicker: 'skills.kicker', title: 'skills.title', lead: 'skills.lead' },
  { id: 'docs', href: '#docs', kicker: 'docs.kicker', title: 'docs.title', lead: 'docs.lead' },
  { id: 'album', href: '#album', kicker: 'album.kicker', title: 'album.title', lead: 'album.lead' },
]

type Props = {
  panel: PanelId | null
  onOpen: (id: PanelId) => void
  onClose: () => void
}

export function WorkPage({ panel, onOpen, onClose }: Props) {
  const { t } = useI18n()
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const pageRef = useRef<HTMLElement | null>(null)
  const [cardsVisible, setCardsVisible] = useState(false)
  const repos = getRepos()
  const docs = getDocs()
  const categories = getCategories()
  const photos = getPhotos()

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const observer = new IntersectionObserver(
      ([entry]) => setCardsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.38),
      { threshold: [0, 0.38] },
    )
    observer.observe(page)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!panel) {
      return
    }
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, onClose])

  const previews: Record<CardId, string> = {
    projects:
      repos.length > 0
        ? `${repos.length} ${t('projects.count')} · ${repos
            .slice(0, 3)
            .map((repo) => repo.name)
            .join(' / ')}`
        : t('projects.empty'),
    research: t('skills.body'),
    docs:
      docs.length > 0
        ? `${docs.length} ${t('docs.count')} · ${categories.join(' / ')}`
        : categories.length > 0
          ? `${categories.length} ${t('docs.categoryCount')} · ${categories.join(' / ')}`
          : t('docs.empty'),
    album:
      photos.length > 0 ? `${photos.length} ${t('album.count')}` : t('album.empty'),
  }

  const active = CARDS.find((card) => card.id === panel) ?? null

  return (
    <section
      id="work"
      ref={pageRef}
      className={cardsVisible ? 'page page--work is-entered' : 'page page--work'}
      aria-labelledby="work-title"
    >
      <div className="page__body container">
        <p className="page-index" aria-hidden="true">
          02 / 03
        </p>
        <header className="work-head">
          <p className="section__kicker">
            <span>{t('work.kicker')}</span>
            <span className="section__rule" aria-hidden="true" />
          </p>
          <h2 className="work-head__title" id="work-title">
            {t('work.title')}
          </h2>
          <p className="work-head__lead">{t('work.lead')}</p>
        </header>

        <ul className="work-grid">
          {CARDS.map((card) => (
            <li key={card.id}>
              <WorkCard
                card={card}
                preview={previews[card.id]}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      </div>

      {active && (active.id === 'projects' || active.id === 'research') ? (
        <div className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
          <div className="panel__bar container">
            <button ref={closeRef} type="button" className="panel__back" onClick={onClose}>
              ← {t('panel.back')}
            </button>
            <button type="button" className="panel__close" onClick={onClose} aria-label={t('panel.close')}>
              ×
            </button>
          </div>
          <div className="panel__body container">
            <header className="panel__head">
              <p className="section__kicker">{t(active.kicker)}</p>
              <h2 className="panel__title" id="panel-title">
                {t(active.title)}
              </h2>
              <p className="panel__lead">{t(active.lead)}</p>
            </header>
            {active.id === 'projects' ? (
              <ProjectList />
            ) : (
              <ResearchBody />
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function WorkCard({
  card,
  preview,
  onOpen,
}: {
  card: Card
  preview: string
  onOpen: (id: PanelId) => void
}) {
  const { t } = useI18n()
  const inner = (
    <>
      <span className="work-card__kicker">{t(card.kicker)}</span>
      <span className="work-card__title">{t(card.title)}</span>
      <span className="work-card__lead">{t(card.lead)}</span>
      <span className="work-card__preview">{preview}</span>
      <span className="work-card__open">
        {t('card.open')}
        <span aria-hidden="true"> →</span>
      </span>
    </>
  )

  if (card.href) {
    return (
      <a className="work-card cursor-target" href={card.href}>
        {inner}
      </a>
    )
  }

  return (
    <button
      type="button"
      className="work-card cursor-target"
      onClick={() => onOpen(card.id as PanelId)}
    >
      {inner}
    </button>
  )
}
