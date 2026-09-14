import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n/LanguageContext'
import type { Photo } from '../types'

type Props = {
  photos: Photo[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}

export function PhotoLightbox({ photos, index, onClose, onIndexChange }: Props) {
  const { t } = useI18n()
  const photo = photos[index]

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (photos.length < 2) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onIndexChange((index + 1) % photos.length)
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onIndexChange((index - 1 + photos.length) % photos.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onIndexChange])

  if (!photo) return null

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('album.lightbox')}
      onClick={onClose}
    >
      <button type="button" className="lightbox__close" onClick={onClose} aria-label={t('panel.close')}>
        ×
      </button>
      {photos.length > 1 ? (
        <>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            onClick={(event) => {
              event.stopPropagation()
              onIndexChange((index - 1 + photos.length) % photos.length)
            }}
            aria-label={t('album.prev')}
          >
            ‹
          </button>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            onClick={(event) => {
              event.stopPropagation()
              onIndexChange((index + 1) % photos.length)
            }}
            aria-label={t('album.next')}
          >
            ›
          </button>
        </>
      ) : null}
      <img
        className="lightbox__img"
        src={photo.src}
        alt={photo.alt}
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
