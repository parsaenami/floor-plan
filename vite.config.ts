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

export default defineConfig(({ mode }) => ({
  plugins: [react(), driveAuthDev(mode)],
  test: {
    environment: 'node',
  },
}))
