/**
 * Minimal Dropbox client for the browser. Sign-in is OAuth with PKCE, which
 * needs no server or secret: Dropbox sends the user back here with a code, and
 * the app trades it for a long-lived refresh token kept in this browser. The
 * app is an "App folder" app, so it only sees Apps/<app name> in the user's
 * Dropbox.
 *
 * Dropbox files have no custom properties, so a plan's id and version are kept
 * in its file name: `<name>.<planId>.<updatedAt>.floorplan.json`.
 */

import type { Auth } from './auth'
import { COMPONENTS_FILE } from './drive'
import { AuthError, type RemoteEntry, type RemoteStore } from './provider'

const APP_KEY = (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined)?.trim() || undefined
export const hasDropbox = !!APP_KEY

const AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize'
const TOKEN = 'https://api.dropboxapi.com/oauth2/token'
const API = 'https://api.dropboxapi.com/2'
const CONTENT = 'https://content.dropboxapi.com/2'

const REFRESH_KEY = 'floor-plan-studio:dropbox-refresh'
const PENDING_KEY = 'floor-plan-studio:dropbox-pending'

/** Dropbox sends users back to the app's root; the path they left from is kept in `PENDING_KEY`. */
const redirectUri = () => `${window.location.origin}/`

function storage(kind: 'local' | 'session') {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

/* ---------- Sign-in ---------- */

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)))

async function tokenRequest(params: Record<string, string>) {
  let r: Response
  try {
    r = await fetch(TOKEN, { method: 'POST', body: new URLSearchParams({ client_id: APP_KEY!, ...params }) })
  } catch {
    throw new Error('Could not reach Dropbox. Check your connection.')
  }
  const body = (await r.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
    error?: string
    error_description?: string
  }
  return { ok: r.ok && !!body.access_token, body }
}

/**
 * Finishes a sign-in when the page loads with Dropbox's ?code=… and removes it
 * from the address. Returns null when this load is not a Dropbox return, else
 * 'connected' or an error message.
 */
export async function completeDropboxSignIn(): Promise<string | null> {
  const url = new URL(window.location.href)
  const state = url.searchParams.get('state')
  const raw = storage('session')?.getItem(PENDING_KEY)
  if (!state || !raw || !APP_KEY) return null
  const pending = JSON.parse(raw) as { state: string; verifier: string; back: string }
  if (pending.state !== state) return null
  storage('session')?.removeItem(PENDING_KEY)
  const code = url.searchParams.get('code')
  const back = new URL(pending.back, window.location.origin)
  window.history.replaceState(null, '', back.pathname + back.search + back.hash)
  // The router only hears about history changes it did not make through popstate.
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  if (!code) return url.searchParams.get('error') === 'access_denied' ? 'Dropbox access was not granted.' : 'Dropbox sign-in failed. Try again.'
  const { ok, body } = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    code_verifier: pending.verifier,
    redirect_uri: redirectUri(),
  })
  if (!ok || !body.refresh_token) return body.error_description || 'Dropbox sign-in failed. Try again.'
  storage('local')?.setItem(REFRESH_KEY, body.refresh_token)
  return 'connected'
}

export function dropboxAuth(): Auth {
  let cached: { token: string; expiresAt: number } | null = null
  return {
    mode: 'browser',
    renewable: true,
    redirects: true,
    async token() {
      if (cached && cached.expiresAt > Date.now()) return cached.token
      const refresh = storage('local')?.getItem(REFRESH_KEY)
      if (!refresh) return null
      const { ok, body } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
      if (!ok) {
        // Access was removed in Dropbox, or the token was revoked.
        if (body.error === 'invalid_grant') return null
        throw new Error(body.error_description || 'Could not renew Dropbox access.')
      }
      // Renew a minute early.
      cached = { token: body.access_token!, expiresAt: Date.now() + ((body.expires_in ?? 14400) - 60) * 1000 }
      return cached.token
    },
    invalidate() {
      cached = null
    },
    async connect() {
      if (!APP_KEY) throw new Error('Dropbox is not set up on this site.')
      const verifier = random(48)
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
      const state = random(16)
      const back = window.location.pathname + window.location.search + window.location.hash
      storage('session')?.setItem(PENDING_KEY, JSON.stringify({ state, verifier, back }))
      const q = new URLSearchParams({
        client_id: APP_KEY,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        token_access_type: 'offline',
        redirect_uri: redirectUri(),
        state,
      })
      window.location.assign(`${AUTHORIZE}?${q}`)
      // The page is leaving; never settle.
      await new Promise(() => {})
    },
    async disconnect() {
      const token = await this.token().catch(() => null)
      if (token) await fetch(`${API}/auth/token/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
      cached = null
      storage('local')?.removeItem(REFRESH_KEY)
    },
  }
}

/* ---------- Files ---------- */

/** Dropbox-API-Arg is an HTTP header, so non-ASCII characters must be escaped. */
const headerJson = (v: unknown) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

async function call(token: string, url: string, init: RequestInit & { arg?: unknown; json?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (init.arg !== undefined) headers['Dropbox-API-Arg'] = headerJson(init.arg)
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  else if (init.body !== undefined) headers['Content-Type'] = 'application/octet-stream'
  let r: Response
  try {
    r = await fetch(url, { method: 'POST', body: init.json !== undefined ? JSON.stringify(init.json) : init.body, headers })
  } catch {
    throw new Error('Could not reach Dropbox. Check your connection.')
  }
  if (r.status === 401) throw new AuthError('Your Dropbox sign-in has expired.')
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    let msg = `Dropbox error ${r.status}`
    try {
      msg = (JSON.parse(text) as { error_summary?: string }).error_summary || msg
    } catch {
      if (text) msg = text
    }
    throw Object.assign(new Error(msg), { status: r.status })
  }
  return r
}

const PLAN_NAME = /^(.*)\.([^.]+)\.(\d+)\.floorplan\.json$/i

/** Keeps a plan name usable as a file name everywhere Dropbox syncs to. */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '').slice(0, 80) || 'Plan'

export function planFileName(name: string, planId: string, updatedAt: number) {
  return `${safeName(name)}.${planId}.${updatedAt}.floorplan.json`
}

export function parseEntry(name: string, path: string): RemoteEntry | null {
  if (name.toLowerCase() === COMPONENTS_FILE) return { id: path, kind: 'components' }
  const m = PLAN_NAME.exec(name)
  return m ? { id: path, kind: 'plan', planId: m[2], updatedAt: Number(m[3]) } : null
}

/** Dropbox as a sync store. File ids are paths inside the app folder, whose root is ''. */
export function dropboxStore(token: string): RemoteStore {
  const remove = async (path: string) => {
    try {
      await call(token, `${API}/files/delete_v2`, { json: { path } })
    } catch (e) {
      // Already gone is fine.
      if ((e as { status?: number }).status !== 409) throw e
    }
  }
  return {
    async ensureFolder() {
      return ''
    },
    async list() {
      const out: RemoteEntry[] = []
      let r = await call(token, `${API}/files/list_folder`, { json: { path: '', limit: 2000 } })
      for (;;) {
        const body = (await r.json()) as { entries: { '.tag': string; name: string; path_display: string }[]; cursor: string; has_more: boolean }
        for (const e of body.entries) {
          const entry = e['.tag'] === 'file' ? parseEntry(e.name, e.path_display) : null
          if (entry) out.push(entry)
        }
        if (!body.has_more) return out
        r = await call(token, `${API}/files/list_folder/continue`, { json: { cursor: body.cursor } })
      }
    },
    async read<T>(path: string) {
      const r = await call(token, `${CONTENT}/files/download`, { arg: { path } })
      return (await r.json()) as T
    },
    async write(f) {
      const path = `/${f.kind === 'plan' ? planFileName(f.name, f.planId, f.updatedAt) : COMPONENTS_FILE}`
      await call(token, `${CONTENT}/files/upload`, {
        arg: { path, mode: 'overwrite', mute: true },
        body: JSON.stringify(f.data),
      })
      // The version is in the name, so a new version is a new file; drop the old one.
      if (f.id && f.id.toLowerCase() !== path.toLowerCase()) await remove(f.id)
      return path
    },
    // Dropbox keeps deleted files restorable for at least 30 days.
    trash: remove,
  }
}
