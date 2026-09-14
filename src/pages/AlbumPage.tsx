import { AlbumGrid } from '../components/AlbumGrid'
import { useI18n } from '../i18n/LanguageContext'

export function AlbumPage() {
  const { t } = useI18n()

  return (
    <section id="album" className="page page--album" aria-labelledby="album-title">
      <h2 id="album-title" className="visually-hidden">
        {t('album.title')}
      </h2>
      <AlbumGrid />
    </section>
  )
}
