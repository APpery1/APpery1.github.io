/*
 * 把照片放进项目根目录的 photo/ 文件夹即可。
 * 支持 jpg / jpeg / png / webp / gif。保存后刷新页面，相册会自动读取。
 * 墙面用压缩缩略图，点开再加载较大的预览图。
 */
import type { Photo } from '../types'

const thumbs = import.meta.glob('../../photo/.thumbs/*.{jpg,jpeg,webp,JPG,JPEG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const fulls = import.meta.glob('../../photo/.full/*.{jpg,jpeg,webp,JPG,JPEG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function stemFromPath(filePath: string): string {
  const file = filePath.split('/').pop() ?? filePath
  return file.replace(/\.[^.]+$/, '')
}

function mapByStem(modules: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(modules).map(([filePath, url]) => [stemFromPath(filePath), url]))
}

const thumbByStem = mapByStem(thumbs)
const fullByStem = mapByStem(fulls)

export function getPhotos(): Photo[] {
  return Object.keys(thumbByStem)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((stem) => ({
      src: fullByStem[stem] ?? thumbByStem[stem],
      thumb: thumbByStem[stem],
      alt: stem,
    }))
    .filter((item) => item.thumb && item.src && item.alt.trim() !== '')
}
