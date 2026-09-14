import snapshotJson from '../../data/repos.json'
import type { Lang } from '../i18n/dict'
import type { Repo, Snapshot } from '../types'

const snapshot = snapshotJson as Snapshot

export function getRepos(): Repo[] {
  if (!snapshot || !Array.isArray(snapshot.repos)) {
    return []
  }
  return snapshot.repos.filter((repo) => repo && typeof repo === 'object' && typeof repo.name === 'string')
}

export function pickDescription(repo: Repo, lang: Lang, fallback: string): string {
  const localized = lang === 'en' ? repo.descEn : repo.descZh
  if (typeof localized === 'string' && localized.trim() !== '') {
    return localized
  }
  if (typeof repo.description === 'string' && repo.description.trim() !== '') {
    return repo.description
  }
  return fallback
}

export function formatPushedAt(value: string): string {
  if (typeof value !== 'string' || value.length < 10) {
    return ''
  }
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}
