import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preparePhotos } from './prepare-photos.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(root, 'photo')
const THUMBS = path.join(root, 'photo', '.thumbs')
const FULL = path.join(root, 'photo', '.full')
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const THUMB_LIMIT = 180 * 1024
const FULL_LIMIT = 900 * 1024

function stemOf(file) {
  return path.basename(file, path.extname(file))
}

async function sizeOf(file) {
  return (await stat(file)).size
}

await preparePhotos()

let originals = []
try {
  originals = (await readdir(SRC)).filter((file) => {
    if (file.startsWith('.')) return false
    return EXTS.has(path.extname(file).toLowerCase())
  })
} catch {
  originals = []
}

if (originals.length === 0) {
  console.log('photo folder is empty — skip size checks')
  process.exit(0)
}

const failures = []
let thumbTotal = 0
let fullTotal = 0

for (const file of originals) {
  const stem = stemOf(file)
  const thumb = path.join(THUMBS, `${stem}.jpg`)
  const display = path.join(FULL, `${stem}.jpg`)
  try {
    const thumbSize = await sizeOf(thumb)
    const fullSize = await sizeOf(display)
    thumbTotal += thumbSize
    fullTotal += fullSize
    if (thumbSize > THUMB_LIMIT) {
      failures.push(`thumb too large: ${stem}.jpg (${Math.round(thumbSize / 1024)}KB)`)
    }
    if (fullSize > FULL_LIMIT) {
      failures.push(`full too large: ${stem}.jpg (${Math.round(fullSize / 1024)}KB)`)
    }
  } catch {
    failures.push(`missing derived image for ${file}`)
  }
}

console.log(
  `photos ${originals.length} · thumbs ${Math.round(thumbTotal / 1024)}KB · full ${Math.round(fullTotal / 1024)}KB`,
)

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('photo performance checks passed')
