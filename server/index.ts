/**
 * Production server for a VPS: serves the built app from dist/ and the Google
 * Drive sign-in endpoints. Run it behind a reverse proxy that handles HTTPS
 * (see deploy/Caddyfile):
 *
 *   npm run build
 *   node --env-file=.env server/index.ts
 *
 * Environment: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET,
 * optional PUBLIC_URL, PORT (default 3000) and HOST (default 127.0.0.1).
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { handleDriveAuth, isConfigured } from './driveAuth.ts'
import { sendResponse, toRequest } from './node.ts'

const DIST = resolve(import.meta.dirname, '../dist')
const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '127.0.0.1'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

async function fileAt(pathname: string): Promise<string | null> {
  // normalize() folds any ../ so requests cannot leave dist/.
  const path = join(DIST, normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ''))
  if (!path.startsWith(DIST)) return null
  try {
    return (await stat(path)).isFile() ? path : null
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname.startsWith('/api/')) {
      const r = await handleDriveAuth(await toRequest(req), process.env)
      return sendResponse(res, r ?? new Response('Not found', { status: 404 }))
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    // Real files as they are; every other path is a client-side route.
    const path = (await fileAt(url.pathname)) ?? join(DIST, 'index.html')
    const hashed = path.includes(`${DIST}/assets/`)
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      // Vite fingerprints assets, so they can be cached forever; index.html never.
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : await readFile(path))
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Floor Plan Studio on http://${HOST}:${PORT}`)
  if (!isConfigured(process.env)) console.warn('Google Drive sign-in is off: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET (32+ characters).')
})
