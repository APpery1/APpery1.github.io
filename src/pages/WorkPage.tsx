import { useEffect, useRef, useState } from 'react'
import { AlbumGrid } from '../components/AlbumGrid'
import { DocList } from '../components/DocList'
import { ProjectList } from '../components/ProjectList'
import type { MessageKey } from '../i18n/dict'
import { useI18n } from '../i18n/LanguageContext'
import { getDocs } from '../lib/docs'
import { getPhotos } from '../lib/photos'
import { getRepos } from '../lib/repos'
import type { PanelId } from '../types'

type Card = {
  id: PanelId
  kicker: MessageKey
  title: MessageKey
  lead: MessageKey
}

const CARDS: Card[] = [
  { id: 'projects', kicker: 'projects.kicker', title: 'projects.title', lead: 'projects.lead' },
  { id: 'research', kicker: 'skills.kicker', title: 'skills.title', lead: 'skills.lead' },
  { id: 'docs', kicker: 'docs.kicker', title: 'docs.title', lead: 'docs.lead' },
  { id: 'album', kicker: 'album.kicker', title: 'album.title', lead: 'album.lead' },
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

  const previews: Record<PanelId, string> = {
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
        ? `${docs.length} ${t('docs.count')} · ${docs
            .slice(0, 2)
            .map((doc) => doc.title)
            .join(' / ')}`
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
              <button
                type="button"
                className="work-card cursor-target"
                onClick={() => onOpen(card.id)}
              >
                <span className="work-card__kicker">{t(card.kicker)}</span>
                <span className="work-card__title">{t(card.title)}</span>
                <span className="work-card__lead">{t(card.lead)}</span>
                <span className="work-card__preview">{previews[card.id]}</span>
                <span className="work-card__open">
                  {t('card.open')}
                  <span aria-hidden="true"> →</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {active ? (
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
            <PanelContent id={active.id} />
          </div>
        </div>
      ) : null}
    </section>
  )
}

function PanelContent({ id }: { id: PanelId }) {
  const { t } = useI18n()

  if (id === 'projects') {
    return <ProjectList />
  }
  if (id === 'research') {
    return <p className="research__body">{t('skills.body')}</p>
  }
  if (id === 'docs') {
    return <DocList />
  }
  return <AlbumGrid />
}
