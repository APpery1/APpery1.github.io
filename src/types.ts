export type Repo = {
  name: string
  url: string
  description: string
  descZh: string
  descEn: string
  language: string | null
  pushedAt: string
  stars: number
  fork: boolean
}

export type Snapshot = {
  generatedAt: string
  owner: string
  repos: Repo[]
}

export type Photo = {
  src: string
  thumb: string
  alt: string
}

export type Doc = {
  title: string
  description: string
  href?: string
  date?: string
}

export type PanelId = 'projects' | 'research'
export type HubPageId = 'about' | 'work' | 'contact'
export type PageId = HubPageId | 'docs' | 'album'
