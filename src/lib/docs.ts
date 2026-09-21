/*
 * 把文档放进项目根目录 document/{分类}/ 即可。
 * 每个子文件夹会自动成为文档页上的一个分类；新建文件夹后刷新即可。
 * 支持 md / pdf / txt / html。Markdown / 文本会在站内阅读器中打开；其它格式仍走原文件链接。
 * 文件名会用作标题，例如「协作笔记.md」。
 */
import { categories as scannedCategories } from 'virtual:doc-categories'
import type { Doc, DocKind } from '../types'
import { docHash } from './hash'

const textModules = import.meta.glob('../../document/*/*.{md,txt,MD,TXT}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const fileModules = import.meta.glob('../../document/*/*.{pdf,html,PDF,HTML}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

function categoryFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.length >= 2 ? parts[parts.length - 2] : ''
}

function titleFromPath(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, '')
}

function kindFromPath(path: string): DocKind {
  const ext = (fileName(path).split('.').pop() ?? '').toLowerCase()
  if (ext === 'md' || ext === 'txt' || ext === 'pdf' || ext === 'html') {
    return ext
  }
  return 'md'
}

export function splitDocTitle(title: string): { index: string | null; name: string } {
  const match = title.match(/^(\d+)[_.\-\s]+(.+)$/)
  if (!match) return { index: null, name: title }
  return { index: match[1], name: match[2] }
}

function toDoc(path: string, value: string, kind: DocKind): Doc | null {
  const category = categoryFromPath(path)
  const title = titleFromPath(path)
  if (!category || !title.trim() || /^readme$/i.test(title)) return null
  return {
    title,
    slug: title,
    category,
    kind,
    description: kind.toUpperCase(),
    href: kind === 'md' || kind === 'txt' ? docHash(category, title) : value,
    content: kind === 'md' || kind === 'txt' ? value : undefined,
  }
}

export function getDocs(category?: string | null): Doc[] {
  const items = [
    ...Object.entries(textModules).map(([path, content]) => toDoc(path, content, kindFromPath(path))),
    ...Object.entries(fileModules).map(([path, href]) => toDoc(path, href, kindFromPath(path))),
  ].filter((item): item is Doc => item !== null)

  const filtered = category ? items.filter((item) => item.category === category) : items
  return filtered.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
}

export function getReadableDocs(category?: string | null): Doc[] {
  return getDocs(category).filter((doc) => doc.kind === 'md' || doc.kind === 'txt')
}

export function getCategories(): string[] {
  const fromFiles = getDocs().map((doc) => doc.category)
  return [...new Set([...scannedCategories, ...fromFiles])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
}
