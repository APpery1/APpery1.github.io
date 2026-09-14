/*
 * 相册清单来自 data/photos.json。
 * 加照片两步：
 *   1. 把图片放到 public/assets/photos/（例如 public/assets/photos/2026-lake.jpg）
 *   2. 在 data/photos.json 加一项：
 *      { "src": "/assets/photos/2026-lake.jpg", "alt": "湖边的清晨" }
 * src 必须以 /assets/photos/ 开头，alt 不能为空，否则该条会被跳过。
 */
import photosJson from '../../data/photos.json'
import type { Photo } from '../types'

const SRC_PREFIX = '/assets/photos/'
const photos = photosJson as Photo[]

function isPhoto(value: unknown): value is Photo {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as Partial<Photo>
  return typeof item.src === 'string' && typeof item.alt === 'string'
}

export function getPhotos(): Photo[] {
  if (!Array.isArray(photos)) {
    return []
  }
  return photos.filter((item) => {
    if (!isPhoto(item)) {
      return false
    }
    if (!item.src.startsWith(SRC_PREFIX)) {
      return false
    }
    if (item.alt.trim() === '') {
      return false
    }
    return true
  })
}
