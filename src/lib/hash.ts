import type { PageId, PanelId } from '../types'

const PANELS: PanelId[] = ['projects', 'research', 'docs', 'album']

export function parseHash(hash: string): { page: PageId; panel: PanelId | null } {
  const id = hash.replace(/^#/, '')
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
