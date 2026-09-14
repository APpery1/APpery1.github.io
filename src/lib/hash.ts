import type { HubPageId, PageId, PanelId } from '../types'

const HUB_PAGES: HubPageId[] = ['about', 'work', 'contact']
const PANELS: PanelId[] = ['projects', 'research']

export function isHubPage(id: string): id is HubPageId {
  return (HUB_PAGES as string[]).includes(id)
}

export function parseHash(hash: string): { page: PageId; panel: PanelId | null } {
  const id = hash.replace(/^#/, '')
  if (id === 'docs' || id === 'album') {
    return { page: id, panel: null }
  }
  if (id === 'contact') {
    return { page: 'contact', panel: null }
  }
  if ((PANELS as string[]).includes(id)) {
    return { page: 'work', panel: id as PanelId }
  }
  if (id === 'work') {
    return { page: 'work', panel: null }
  }
  return { page: 'about', panel: null }
}
