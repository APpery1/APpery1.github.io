import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { preparePhotos } from './scripts/prepare-photos.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))

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
  plugins: [photoPreparePlugin(), react()],
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
