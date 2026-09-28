/**
 * Google Drive sign-in for Floor Plan Studio, run on the server so users stay
 * connected. It exchanges Google's authorisation code for a refresh token
 * (which needs the client secret, so it cannot happen in the browser), keeps
 * that token in an encrypted httpOnly cookie, and hands the page short-lived
 * access tokens on request. There is no database.
 *
 * Written against the standard Request/Response API so the same code runs on
 * Netlify Functions, the Node server in server/index.ts and the Vite dev server.
 *
 * Routes (all under /api/drive/):
 *   GET  config    { enabled } — whether the server is set up
 *   GET  login     redirect to Google's consent screen
 *   GET  callback  Google redirects back here
 *   POST token     { access_token, expires_in } or 401
 *   POST logout    revoke and forget the refresh token
 */

export interface DriveAuthEnv {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Long random string used to encrypt cookies. */
  SESSION_SECRET?: string
  /** Public origin, e.g. https://plans.example.com. Defaults to the request's own origin. */
  PUBLIC_URL?: string
}

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

const COOKIE_PATH = '/api/drive'
const SESSION_COOKIE = 'fps_drive'
const FLOW_COOKIE = 'fps_oauth'
const SESSION_MAX_AGE = 60 * 60 * 24 * 180
const FLOW_MAX_AGE = 60 * 10

export const isConfigured = (env: DriveAuthEnv) =>
  !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32)

/** Handles /api/drive/* requests; returns null for any other path. */
export async function handleDriveAuth(req: Request, env: DriveAuthEnv): Promise<Response | null> {
  const url = new URL(req.url)
  const m = url.pathname.match(/\/api\/drive\/(config|login|callback|token|logout)\/?$/)
  if (!m) return null
  const route = m[1]

  if (route === 'config') return json({ enabled: isConfigured(env) }, 200, { 'Cache-Control': 'no-store' })
  if (!isConfigured(env)) return json({ error: 'Drive sign-in is not configured on this server.' }, 503)

  const origin = (env.PUBLIC_URL || url.origin).replace(/\/$/, '')
  const secure = origin.startsWith('https:')
  const redirectUri = `${origin}/api/drive/callback`
  const key = await cookieKey(env.SESSION_SECRET!)

  try {
    switch (route) {
      case 'login': {
        if (req.method !== 'GET') return methodNotAllowed()
        const state = randomToken()
        const verifier = randomToken(48)
        const back = safeReturn(url.searchParams.get('return'))
        const flow = await seal(key, { state, verifier, back, exp: Date.now() + FLOW_MAX_AGE * 1000 })
        const auth = new URL(GOOGLE_AUTH)
        auth.search = new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID!,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: SCOPE,
          access_type: 'offline',
          // Google only issues a refresh token with a fresh consent.
          prompt: 'consent',
          include_granted_scopes: 'true',
          state,
          code_challenge: await challenge(verifier),
          code_challenge_method: 'S256',
        }).toString()
        return redirect(auth.toString(), [cookie(FLOW_COOKIE, flow, FLOW_MAX_AGE, secure, 'Lax')])
      }

      case 'callback': {
        if (req.method !== 'GET') return methodNotAllowed()
        const flow = await open<{ state: string; verifier: string; back: string; exp: number }>(key, readCookie(req, FLOW_COOKIE))
        const clearFlow = cookie(FLOW_COOKIE, '', 0, secure, 'Lax')
        const back = (outcome: string) => redirect(withParam(flow?.back ?? '/', 'drive', outcome), [clearFlow])
        if (!flow || flow.exp < Date.now() || flow.state !== url.searchParams.get('state')) return back('expired')
        if (url.searchParams.get('error')) return back('denied')
        const code = url.searchParams.get('code')
        if (!code) return back('error')
        const tokens = await googleToken({
          grant_type: 'authorization_code',
          code,
          code_verifier: flow.verifier,
          redirect_uri: redirectUri,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
        })
        if (!tokens.refresh_token) return back('error')
        const session = await seal(key, { rt: tokens.refresh_token })
        return redirect(withParam(flow.back, 'drive', 'connected'), [clearFlow, cookie(SESSION_COOKIE, session, SESSION_MAX_AGE, secure, 'Strict')])
      }

      case 'token': {
        if (req.method !== 'POST') return methodNotAllowed()
        if (!sameSite(req)) return json({ error: 'Cross-site request refused.' }, 403)
        const session = await open<{ rt: string }>(key, readCookie(req, SESSION_COOKIE))
        if (!session) return json({ error: 'Not connected.' }, 401)
        const tokens = await googleToken({
          grant_type: 'refresh_token',
          refresh_token: session.rt,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
        })
        if (tokens.error === 'invalid_grant' || !tokens.access_token) {
          // Revoked in the Google account, or expired: the user has to connect again.
          return json({ error: 'Google access was revoked or has expired.' }, 401, {}, [cookie(SESSION_COOKIE, '', 0, secure, 'Strict')])
        }
        return json({ access_token: tokens.access_token, expires_in: tokens.expires_in ?? 3600 }, 200, { 'Cache-Control': 'no-store' })
      }

      case 'logout': {
        if (req.method !== 'POST') return methodNotAllowed()
        if (!sameSite(req)) return json({ error: 'Cross-site request refused.' }, 403)
        const session = await open<{ rt: string }>(key, readCookie(req, SESSION_COOKIE))
        if (session) {
          await fetch(`${GOOGLE_REVOKE}?token=${encodeURIComponent(session.rt)}`, { method: 'POST' }).catch(() => undefined)
        }
        return json({ ok: true }, 200, {}, [cookie(SESSION_COOKIE, '', 0, secure, 'Strict')])
      }
    }
  } catch (e) {
    console.error('[drive-auth]', e)
    if (route === 'callback') return redirect('/?drive=error')
    return json({ error: 'Could not reach Google. Try again.' }, 502)
  }
  return null
}

/* ---------- Google ---------- */

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}

async function googleToken(params: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const body = (await r.json().catch(() => ({}))) as TokenResponse
  if (!r.ok && !body.error) body.error = `http_${r.status}`
  return body
}

/* ---------- Requests & responses ---------- */

/**
 * Browsers mark same-origin fetches with Sec-Fetch-Site; older ones send Origin.
 * The session cookie is SameSite=Strict too, so this is a second line of defence.
 */
function sameSite(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site) return site === 'same-origin'
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin
}

/** Only same-site relative paths, so the return address cannot send users elsewhere. */
function safeReturn(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/'
  return raw
}

function withParam(path: string, key: string, value: string): string {
  const u = new URL(path, 'http://x')
  u.searchParams.set(key, value)
  return u.pathname + u.search + u.hash
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}, cookies: string[] = []): Response {
  const h = new Headers({ 'Content-Type': 'application/json', ...headers })
  for (const c of cookies) h.append('Set-Cookie', c)
  return new Response(JSON.stringify(body), { status, headers: h })
}

function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const c of cookies) h.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers: h })
}

const methodNotAllowed = () => json({ error: 'Method not allowed.' }, 405)

function cookie(name: string, value: string, maxAge: number, secure: boolean, sameSiteMode: 'Lax' | 'Strict'): string {
  return [`${name}=${value}`, `Path=${COOKIE_PATH}`, `Max-Age=${maxAge}`, 'HttpOnly', `SameSite=${sameSiteMode}`, ...(secure ? ['Secure'] : [])].join('; ')
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

/* ---------- Crypto ---------- */

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const randomToken = (bytes = 24) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))

async function challenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))))
}

async function cookieKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`fps-drive:${secret}`))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Encrypts and authenticates a value for a cookie. */
async function seal(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))))
  const out = new Uint8Array(iv.length + data.length)
  out.set(iv)
  out.set(data, iv.length)
  return b64url(out)
}

/** Decrypts a sealed cookie; null if missing or tampered with. */
async function open<T>(key: CryptoKey, sealed: string | null): Promise<T | null> {
  if (!sealed) return null
  try {
    const bytes = unb64url(sealed)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    return JSON.parse(dec.decode(plain)) as T
  } catch {
    return null
  }
}
