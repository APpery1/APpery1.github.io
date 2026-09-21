import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { preparePhotos } from './scripts/prepare-photos.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const documentDir = path.join(root, 'document')
const DOC_CATEGORIES_ID = 'virtual:doc-categories'
const RESOLVED_DOC_CATEGORIES_ID = `\0${DOC_CATEGORIES_ID}`

function scanDocCategories(): string[] {
  try {
    return fs
      .readdirSync(documentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  } catch {
    return []
  }
}

function isInsideDocumentDir(file: string): boolean {
  const resolved = path.resolve(file)
  return resolved === documentDir || resolved.startsWith(documentDir + path.sep)
}

function docCategoriesPlugin() {
  return {
    name: 'doc-categories',
    resolveId(id: string) {
      if (id === DOC_CATEGORIES_ID) return RESOLVED_DOC_CATEGORIES_ID
    },
    load(id: string) {
      if (id !== RESOLVED_DOC_CATEGORIES_ID) return
      return `export const categories = ${JSON.stringify(scanDocCategories())}`
    },
    configureServer(server) {
      server.watcher.add(documentDir)
      const invalidate = (file: string) => {
        if (!isInsideDocumentDir(file)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_DOC_CATEGORIES_ID)
        if (mod) void server.reloadModule(mod)
      }
      server.watcher.on('add', invalidate)
      server.watcher.on('unlink', invalidate)
      server.watcher.on('addDir', invalidate)
      server.watcher.on('unlinkDir', invalidate)
    },
  }
}

function photoPreparePlugin() {
  return {
    name: 'prepare-photos',
    async buildStart() {
      await preparePhotos()
    },
    configureServer(server) {
      const photoDir = path.join(root, 'photo')
      server.watcher.add(photoDir)
      const rerun = async (file: string) => {
        const normalized = file.replace(/\\/g, '/')
        if (!normalized.includes('/photo/')) return
        if (normalized.includes('/photo/.thumbs/') || normalized.includes('/photo/.full/')) return
        await preparePhotos()
      }
      server.watcher.on('add', rerun)
      server.watcher.on('change', rerun)
    },
  }
}

export default defineConfig({
  plugins: [photoPreparePlugin(), docCategoriesPlugin(), react()],
  base: '/',
  assetsInclude: ['**/*.pdf', '**/*.md', '**/*.txt'],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    port: 8080,
    strictPort: true,
  },
  preview: {
    port: 8080,
    strictPort: true,
  },
})
