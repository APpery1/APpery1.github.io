import { useI18n } from '../i18n/LanguageContext'
import ParticleText from '../components/ParticleText'

export function IntroPage() {
  const { t } = useI18n()

  return (
    <section id="about" className="page intro-page" aria-labelledby="hero-title">
      <div className="page__body container intro-page__content">
        <p className="hero__greeting">{t('hero.greeting')}</p>
        <h1 className="hero__name" id="hero-title">
          <ParticleText
            text={t('about.nickname')}
            particleSize={1.8}
            density={4}
            color="#d9deef"
            highlightColor="#777ee8"
            scatter={130}
            gatherDuration={1200}
            stagger={260}
            pointerRepel={30}
            repelRadius={105}
            idleDrift={0.35}
            trigger="mount"
            fontSize="clamp(4rem, 12vw, 8rem)"
            fontWeight={800}
            glow
          />
        </h1>
        <p className="hero__school">{t('hero.schoolLine')}</p>
      </div>
    </section>
  )
}
