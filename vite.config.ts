import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleDriveAuth } from './server/driveAuth.ts'
import { sendResponse, toRequest } from './server/node.ts'

/** Serves the Google Drive sign-in endpoints during `npm run dev`, from .env / .env.local. */
function driveAuthDev(mode: string): Plugin {
  // Load every variable, not just VITE_ ones; these stay on the server.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    name: 'drive-auth-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/drive/')) return next()
        void (async () => {
          const r = await handleDriveAuth(await toRequest(req), env)
          await sendResponse(res, r ?? new Response('Not found', { status: 404 }))
        })().catch(next)
      })
    },
  }
}

/**
 * Emits dist/sw.js from src/sw.js with the list of built files to precache. The
 * cache name is a hash of that list and of index.html, so each deploy gets its own.
 */
function serviceWorker(): Plugin {
  let publicDir = ''
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_, bundle) {
      const publicFiles = publicDir ? readdirSync(publicDir, { recursive: true, withFileTypes: true }) : []
      const files = [
        ...Object.keys(bundle),
        ...publicFiles.filter((f) => f.isFile()).map((f) => relative(publicDir, join(f.parentPath, f.name)).split(sep).join('/')),
      ].filter((f) => f !== 'index.html' && f !== 'sw.js' && !f.endsWith('.map'))
      const urls = ['/', ...files.sort().map((f) => `/${f}`)]
      const html = bundle['index.html']
      const version = createHash('sha256')
        .update(urls.join('\n'))
        .update(html?.type === 'asset' ? html.source : '')
        .digest('hex')
        .slice(0, 12)
      const source = readFileSync(resolve(import.meta.dirname, 'src/sw.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(urls, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), driveAuthDev(mode), serviceWorker()],
  test: {
    environment: 'node',
  },
}))
