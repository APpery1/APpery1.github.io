/*
 * 把文档放进项目根目录的 document/ 文件夹即可。
 * 支持 md / pdf / txt / html。保存后刷新页面，文档页会自动读取。
 * 文件名会用作标题，例如「协作笔记.md」。
 */
import type { Doc } from '../types'

const modules = import.meta.glob('../../document/*.{md,pdf,txt,html,MD,PDF,TXT,HTML}', {
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

function typeFromPath(path: string): string {
  const ext = fileName(path).split('.').pop() ?? ''
  return ext.toUpperCase()
}

export function getDocs(): Doc[] {
  return Object.entries(modules)
    .filter(([path]) => !/^readme$/i.test(titleFromPath(path)))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([path, href]) => ({
      title: titleFromPath(path),
      description: typeFromPath(path),
      href,
    }))
    .filter((item) => item.title.trim() !== '' && item.href)
}
