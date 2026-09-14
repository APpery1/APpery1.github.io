import { useI18n } from '../i18n/LanguageContext'
import { getPhotos } from '../lib/photos'

export function AlbumGrid() {
  const { t } = useI18n()
  const photos = getPhotos()

  if (photos.length === 0) {
    return <p className="empty-state">{t('album.empty')}</p>
  }

  return (
    <ul className="album-grid">
      {photos.map((photo) => (
        <li key={photo.src}>
          <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
        </li>
      ))}
    </ul>
  )
}
