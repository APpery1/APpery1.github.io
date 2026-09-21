import type { HubPageId, PageId, PanelId } from '../types'

const HUB_PAGES: HubPageId[] = ['about', 'work', 'contact']
const PANELS: PanelId[] = ['projects', 'research']

export function isHubPage(id: string): id is HubPageId {
  return (HUB_PAGES as string[]).includes(id)
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseHash(hash: string): {
  page: PageId
  panel: PanelId | null
  category: string | null
  doc: string | null
} {
  const id = hash.replace(/^#/, '')
  if (id === 'docs' || id.startsWith('docs/')) {
    const rest = id.startsWith('docs/') ? id.slice(5) : ''
    if (!rest) return { page: 'docs', panel: null, category: null, doc: null }
    const [rawCategory, ...restParts] = rest.split('/')
    const category = decodePart(rawCategory).trim()
    const doc = restParts.length ? decodePart(restParts.join('/')).trim() : ''
    return {
      page: 'docs',
      panel: null,
      category: category || null,
      doc: doc || null,
    }
  }
  if (id === 'album') {
    return { page: 'album', panel: null, category: null, doc: null }
  }
  if (id === 'contact') {
    return { page: 'contact', panel: null, category: null, doc: null }
  }
  if ((PANELS as string[]).includes(id)) {
    return { page: 'work', panel: id as PanelId, category: null, doc: null }
  }
  if (id === 'work') {
    return { page: 'work', panel: null, category: null, doc: null }
  }
  return { page: 'about', panel: null, category: null, doc: null }
}

export function categoryHash(category: string): string {
  return `#docs/${encodeURIComponent(category)}`
}

export function docHash(category: string, slug: string): string {
  return `${categoryHash(category)}/${encodeURIComponent(slug)}`
}
