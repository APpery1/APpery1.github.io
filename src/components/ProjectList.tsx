import { useI18n } from '../i18n/LanguageContext'
import { formatPushedAt, getRepos, pickDescription } from '../lib/repos'

export function ProjectList() {
  const { t, lang } = useI18n()
  const repos = getRepos()

  if (repos.length === 0) {
    return <p className="empty-state">{t('projects.empty')}</p>
  }

  return (
    <ul className="project-list">
      {repos.map((repo, index) => {
        const date = formatPushedAt(repo.pushedAt)
        const description = pickDescription(repo, lang, t('projects.noDescription'))
        const n = String(index + 1).padStart(2, '0')

        return (
          <li key={repo.name} className="project">
            <a
              className="project__link"
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="project__index" aria-hidden="true">
                {n}
              </span>
              <span className="project__body">
                <span className="project__top">
                  <span className="project__name">{repo.name}</span>
                  <span className="project__meta">
                    {repo.language ? <span>{repo.language}</span> : null}
                    {date ? <time dateTime={repo.pushedAt}>{date}</time> : null}
                  </span>
                </span>
                <span className="project__desc">{description}</span>
              </span>
              <span className="project__arrow" aria-hidden="true">
                ↗
              </span>
              <span className="visually-hidden">{t('projects.open')}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}
