import { useState } from 'react'
import DriftWall from './DriftWall'
import { PhotoLightbox } from './PhotoLightbox'
import { useI18n } from '../i18n/LanguageContext'
import { getPhotos } from '../lib/photos'

export function AlbumGrid() {
  const { t } = useI18n()
  const photos = getPhotos()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (photos.length === 0) {
    return <p className="empty-state">{t('album.empty')}</p>
  }

  const items = photos.map((photo) => ({
    image: photo.thumb,
    title: photo.alt,
  }))

  return (
    <div className="album-wall">
      <DriftWall
        items={items}
        columns={5}
        tileWidth={210}
        tileHeight={140}
        gap={16}
        radius={14}
        tilt={0}
        turn={0}
        roll={0}
        depth={0}
        speed={42}
        direction="up"
        variance={0.45}
        parallax={0}
        lift={0}
        fade={0}
        dim={1}
        overlayColor="transparent"
        onItemClick={(item) => {
          const next = photos.findIndex((photo) => photo.thumb === item.image)
          if (next >= 0) setOpenIndex(next)
        }}
      />
      {openIndex !== null ? (
        <PhotoLightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onIndexChange={setOpenIndex}
        />
      ) : null}
    </div>
  )
}
