import { loadGis, requestToken, revokeToken, type Token } from './drive'

/**
 * How the app gets Google access tokens.
 * - `server`: the /api/drive endpoints (server/driveAuth.ts) keep the user signed
 *   in with a refresh token, and hand out access tokens without any popup.
 * - `browser`: no server; Google's popup gives one-hour tokens. Needs a client ID
 *   built in (VITE_GOOGLE_CLIENT_ID) or entered by whoever hosts the app.
 * - `none`: neither is available on this deployment.
 */
export type AuthMode = 'server' | 'browser' | 'none'

export interface Auth {
  mode: AuthMode
  /** A usable access token, renewed without the user where possible; null when they must connect again. */
  token(): Promise<string | null>
  /** Forgets the cached token after Drive rejected it. */
  invalidate(): void
  /** Starts sign-in. The server flow leaves the page and comes back with ?drive=connected. */
  connect(): Promise<void>
  disconnect(): Promise<void>
}

const BUILT_IN_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined
export const hasBuiltInClientId = !!BUILT_IN_CLIENT_ID

/** Picks the best sign-in available here: the server if it answers, else a browser client ID. */
export async function detectAuth(storedClientId?: string): Promise<Auth> {
  try {
    const r = await fetch('/api/drive/config', { cache: 'no-store' })
    // Static hosts answer unknown paths with index.html; only JSON counts.
    if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
      const { enabled } = (await r.json()) as { enabled?: boolean }
      if (enabled) return serverAuth()
    }
  } catch {
    // No server; fall through.
  }
  const id = BUILT_IN_CLIENT_ID ?? storedClientId
  return id ? browserAuth(id) : noAuth()
}

/* ---------- Server ---------- */

function serverAuth(): Auth {
  let cached: Token | null = null
  return {
    mode: 'server',
    async token() {
      if (cached && cached.expiresAt > Date.now()) return cached.token
      let r: Response
      try {
        r = await fetch('/api/drive/token', { method: 'POST', credentials: 'same-origin' })
      } catch {
        throw new Error('Could not reach the server. Check your connection.')
      }
      if (r.status === 401) return null
      const body = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
      if (!r.ok || !body.access_token) throw new Error(body.error || 'Could not renew Google Drive access.')
      // Renew a minute early.
      cached = { token: body.access_token, expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 }
      return cached.token
    },
    invalidate() {
      cached = null
    },
    async connect() {
      const back = window.location.pathname + window.location.search
      window.location.assign(`/api/drive/login?return=${encodeURIComponent(back)}`)
      // The page is leaving; never settle.
      await new Promise(() => {})
    },
    async disconnect() {
      cached = null
      await fetch('/api/drive/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
    },
  }
}

/* ---------- Browser (popup) ---------- */

const TOKEN_KEY = 'floor-plan-studio:drive-token'

function readToken(): Token | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null
    return t && t.expiresAt > Date.now() ? t : null
  } catch {
    return null
  }
}

function storeToken(t: Token | null) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // The token then only lives in memory for this tab.
  }
}

export function browserAuth(clientId: string): Auth {
  let cached = readToken()
  // Load Google's script now, so the popup opens straight from the click.
  loadGis().catch(() => {
    // Reported when the user actually tries to sign in.
  })
  return {
    mode: 'browser',
    async token() {
      return cached && cached.expiresAt > Date.now() ? cached.token : null
    },
    invalidate() {
      cached = null
      storeToken(null)
    },
    async connect() {
      cached = await requestToken(clientId, readToken() ? '' : undefined)
      storeToken(cached)
    },
    async disconnect() {
      if (cached) revokeToken(cached.token)
      cached = null
      storeToken(null)
    },
  }
}

function noAuth(): Auth {
  return {
    mode: 'none',
    token: async () => null,
    invalidate() {},
    async connect() {
      throw new Error('Google Drive is not set up on this site.')
    },
    async disconnect() {},
  }
}
