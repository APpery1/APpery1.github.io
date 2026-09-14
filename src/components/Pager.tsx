import type { MessageKey } from '../i18n/dict'
import { useI18n } from '../i18n/LanguageContext'
import type { PageId } from '../types'

const DOTS: { id: PageId; label: MessageKey }[] = [
  { id: 'about', label: 'nav.about' },
  { id: 'work', label: 'nav.work' },
  { id: 'contact', label: 'nav.contact' },
]

type Props = {
  active: PageId
}

export function Pager({ active }: Props) {
  const { t } = useI18n()

  return (
    <nav className="pager" aria-label={t('a11y.pager')}>
      {DOTS.map((dot) => (
        <a
          key={dot.id}
          href={`#${dot.id}`}
          className={dot.id === active ? 'pager__dot is-active' : 'pager__dot'}
          aria-label={t(dot.label)}
          aria-current={dot.id === active ? 'true' : undefined}
        />
      ))}
    </nav>
  )
}
