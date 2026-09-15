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

export function parseHash(hash: string): { page: PageId; panel: PanelId | null; doc: string | null } {
  const id = hash.replace(/^#/, '')
  if (id === 'docs' || id.startsWith('docs/')) {
    const rest = id.startsWith('docs/') ? decodePart(id.slice(5)).trim() : ''
    return { page: 'docs', panel: null, doc: rest || null }
  }
  if (id === 'album') {
    return { page: 'album', panel: null, doc: null }
  }
  if (id === 'contact') {
    return { page: 'contact', panel: null, doc: null }
  }
  if ((PANELS as string[]).includes(id)) {
    return { page: 'work', panel: id as PanelId, doc: null }
  }
  if (id === 'work') {
    return { page: 'work', panel: null, doc: null }
  }
  return { page: 'about', panel: null, doc: null }
}

export function docHash(slug: string): string {
  return `#docs/${encodeURIComponent(slug)}`
}
