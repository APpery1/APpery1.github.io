import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(root, 'photo')
const THUMBS = path.join(root, 'photo', '.thumbs')
const FULL = path.join(root, 'photo', '.full')
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

async function stale(src, dest) {
  try {
    const [input, output] = await Promise.all([stat(src), stat(dest)])
    return input.mtimeMs > output.mtimeMs
  } catch {
    return true
  }
}

async function render(src, dest, max, quality) {
  await sharp(src)
    .rotate()
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toFile(dest)
}

export async function preparePhotos() {
  await mkdir(THUMBS, { recursive: true })
  await mkdir(FULL, { recursive: true })

  let files = []
  try {
    files = await readdir(SRC)
  } catch {
    return { thumbs: 0, full: 0 }
  }

  let thumbs = 0
  let full = 0
  for (const file of files) {
    if (file.startsWith('.')) continue
    const ext = path.extname(file).toLowerCase()
    if (!EXTS.has(ext)) continue
    const src = path.join(SRC, file)
    const info = await stat(src)
    if (!info.isFile()) continue

    const stem = path.basename(file, path.extname(file))
    const thumb = path.join(THUMBS, `${stem}.jpg`)
    const display = path.join(FULL, `${stem}.jpg`)

    if (await stale(src, thumb)) {
      await render(src, thumb, 640, 72)
      thumbs += 1
    }
    if (await stale(src, display)) {
      await render(src, display, 1920, 82)
      full += 1
    }
  }
  return { thumbs, full }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const result = await preparePhotos()
  console.log(`photos ready (thumbs ${result.thumbs}, full ${result.full})`)
}
