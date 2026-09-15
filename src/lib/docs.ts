/*
 * 把文档放进项目根目录的 document/ 文件夹即可。
 * 支持 md / pdf / txt / html。保存后刷新页面，文档页会自动读取。
 * Markdown / 文本会在站内阅读器中打开；其它格式仍走原文件链接。
 * 文件名会用作标题，例如「协作笔记.md」。
 */
import type { Doc, DocKind } from '../types'
import { docHash } from './hash'

const textModules = import.meta.glob('../../document/*.{md,txt,MD,TXT}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const fileModules = import.meta.glob('../../document/*.{pdf,html,PDF,HTML}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function fileName(path: string): string {
  return path.split('/').pop() ?? path
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

function toDoc(path: string, value: string, kind: DocKind): Doc {
  const title = titleFromPath(path)
  return {
    title,
    slug: title,
    kind,
    description: kind.toUpperCase(),
    href: kind === 'md' || kind === 'txt' ? docHash(title) : value,
    content: kind === 'md' || kind === 'txt' ? value : undefined,
  }
}

export function getDocs(): Doc[] {
  const items = [
    ...Object.entries(textModules).map(([path, content]) => toDoc(path, content, kindFromPath(path))),
    ...Object.entries(fileModules).map(([path, href]) => toDoc(path, href, kindFromPath(path))),
  ]

  return items
    .filter((item) => !/^readme$/i.test(item.title) && item.title.trim() !== '')
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
}

export function getReadableDocs(): Doc[] {
  return getDocs().filter((doc) => doc.kind === 'md' || doc.kind === 'txt')
}
