import { ContactList } from '../components/ContactList'
import { useI18n } from '../i18n/LanguageContext'

export function ContactPage() {
  const { t } = useI18n()

  return (
    <section id="contact" className="page page--contact" aria-labelledby="contact-title">
      <div className="page__body container">
        <p className="page-index" aria-hidden="true">
          03 / 03
        </p>
        <header className="contact-head">
          <p className="section__kicker">
            <span>{t('contact.kicker')}</span>
            <span className="section__rule" aria-hidden="true" />
          </p>
          <h2 className="section__title" id="contact-title">
            {t('contact.title')}
          </h2>
          <p className="section__lead">{t('contact.lead')}</p>
        </header>
        <ContactList />
      </div>
      <footer className="footer">
        <div className="container footer__inner">
          <p>{t('footer.copyright')}</p>
          <p className="footer__note">{t('footer.note')}</p>
        </div>
      </footer>
    </section>
  )
}
