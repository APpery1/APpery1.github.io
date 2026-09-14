/*
 * 文档清单来自 data/docs.json。
 * 加一篇：在数组里加
 *   { "title": "标题", "description": "一句话", "href": "https://...", "date": "2026-09-14" }
 * href / date 可省略。title 与 description 必填，否则该条会被跳过。
 */
import docsJson from '../../data/docs.json'
import type { Doc } from '../types'

const docs = docsJson as Doc[]

function isDoc(value: unknown): value is Doc {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as Partial<Doc>
  return typeof item.title === 'string' && typeof item.description === 'string'
}

export function getDocs(): Doc[] {
  if (!Array.isArray(docs)) {
    return []
  }
  return docs.filter((item) => {
    if (!isDoc(item)) {
      return false
    }
    if (item.title.trim() === '' || item.description.trim() === '') {
      return false
    }
    return true
  })
}
