import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleDriveAuth, type DriveAuthEnv } from './driveAuth.ts'

const env: DriveAuthEnv = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  SESSION_SECRET: 'x'.repeat(40),
}
const ORIGIN = 'https://plans.example.com'

const call = async (path: string, init: RequestInit & { cookie?: string } = {}, e = env) => {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set('cookie', init.cookie)
  const r = await handleDriveAuth(new Request(ORIGIN + path, { ...init, headers }), e)
  if (!r) throw new Error(`unhandled ${path}`)
  return r
}
/** Cookie header value from a response's Set-Cookie lines. */
const cookiesOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c) => !c.endsWith('='))
    .join('; ')

let google: ReturnType<typeof vi.fn>
beforeEach(() => {
  google = vi.fn(async (url: string, init?: RequestInit) => {
    const params = new URLSearchParams(String(init?.body ?? ''))
    if (url.includes('/revoke')) return new Response('{}')
    if (params.get('grant_type') === 'authorization_code') {
      return Response.json({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3599 })
    }
    if (params.get('refresh_token') === 'rt-1') return Response.json({ access_token: 'at-2', expires_in: 3599 })
    return Response.json({ error: 'invalid_grant' }, { status: 400 })
  })
  vi.stubGlobal('fetch', google)
})
afterEach(() => vi.unstubAllGlobals())

/** Walks the sign-in: login, then Google redirecting back with a code. */
async function signIn(returnTo = '/plan/abc') {
  const login = await call(`/api/drive/login?return=${encodeURIComponent(returnTo)}`)
  const state = new URL(login.headers.get('location')!).searchParams.get('state')!
  const back = await call(`/api/drive/callback?code=the-code&state=${state}`, { cookie: cookiesOf(login) })
  return { login, back }
}

describe('drive sign-in server', () => {
  it('reports whether it is configured', async () => {
    expect(await (await call('/api/drive/config')).json()).toEqual({ enabled: true })
    expect(await (await call('/api/drive/config', {}, { GOOGLE_CLIENT_ID: 'x' })).json()).toEqual({ enabled: false })
    expect(await (await call('/api/drive/config', {}, { ...env, SESSION_SECRET: 'short' })).json()).toEqual({ enabled: false })
  })

  it('ignores other paths', async () => {
    expect(await handleDriveAuth(new Request(`${ORIGIN}/api/other`), env)).toBeNull()
  })

  it('sends the user to Google asking for offline drive.file access with PKCE', async () => {
    const r = await call('/api/drive/login?return=/components')
    expect(r.status).toBe(302)
    const to = new URL(r.headers.get('location')!)
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(to.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
    expect(to.searchParams.get('access_type')).toBe('offline')
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/drive/callback`)
    expect(to.searchParams.get('code_challenge_method')).toBe('S256')
    const flow = r.headers.getSetCookie()[0]
    expect(flow).toMatch(/^fps_oauth=.+; Path=\/api\/drive; .*HttpOnly; SameSite=Lax; Secure$/)
  })

  it('stores the refresh token in an encrypted cookie and returns to the page', async () => {
    const { back } = await signIn('/plan/abc')
    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toBe('/plan/abc?drive=connected')
    const session = back.headers.getSetCookie().find((c) => c.startsWith('fps_drive='))!
    expect(session).toContain('HttpOnly')
    expect(session).toContain('SameSite=Strict')
    // The cookie is sealed, never the raw token.
    expect(session).not.toContain('rt-1')
    const exchange = new URLSearchParams(String(google.mock.calls[0][1].body))
    expect(exchange.get('code')).toBe('the-code')
    expect(exchange.get('client_secret')).toBe('client-secret')
    expect(exchange.get('code_verifier')).toBeTruthy()
  })

  it('hands out fresh access tokens from the cookie', async () => {
    const { back } = await signIn()
    const r = await call('/api/drive/token', { method: 'POST', cookie: cookiesOf(back), headers: { 'sec-fetch-site': 'same-origin' } })
    expect(await r.json()).toEqual({ access_token: 'at-2', expires_in: 3599 })
  })

  it('refuses tokens without a session, to other sites, or with a tampered cookie', async () => {
    expect((await call('/api/drive/token', { method: 'POST' })).status).toBe(401)
    const { back } = await signIn()
    const cookie = cookiesOf(back)
    expect((await call('/api/drive/token', { method: 'POST', cookie, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await call('/api/drive/token', { method: 'POST', cookie, headers: { origin: 'https://evil.example' } })).status).toBe(403)
    const tampered = cookie.replace(/fps_drive=(.)/, (_, c) => `fps_drive=${c === 'A' ? 'B' : 'A'}`)
    expect((await call('/api/drive/token', { method: 'POST', cookie: tampered })).status).toBe(401)
  })

  it('clears the session when Google revoked access', async () => {
    const { back } = await signIn()
    google.mockImplementation(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }))
    const r = await call('/api/drive/token', { method: 'POST', cookie: cookiesOf(back) })
    expect(r.status).toBe(401)
    expect(r.headers.getSetCookie()[0]).toMatch(/^fps_drive=; .*Max-Age=0/)
  })

  it('rejects a callback whose state does not match', async () => {
    const login = await call('/api/drive/login?return=/x')
    const r = await call('/api/drive/callback?code=c&state=forged', { cookie: cookiesOf(login) })
    expect(r.headers.get('location')).toBe('/x?drive=expired')
    expect(google).not.toHaveBeenCalled()
  })

  it('reports a declined consent', async () => {
    const login = await call('/api/drive/login?return=/x')
    const state = new URL(login.headers.get('location')!).searchParams.get('state')!
    const r = await call(`/api/drive/callback?error=access_denied&state=${state}`, { cookie: cookiesOf(login) })
    expect(r.headers.get('location')).toBe('/x?drive=denied')
  })

  it('never redirects off the site', async () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example']) {
      const { back } = await signIn(bad)
      expect(back.headers.get('location')).toBe('/?drive=connected')
    }
  })

  it('revokes and forgets on logout', async () => {
    const { back } = await signIn()
    const r = await call('/api/drive/logout', { method: 'POST', cookie: cookiesOf(back) })
    expect(r.status).toBe(200)
    expect(google.mock.calls.at(-1)?.[0]).toContain('/revoke?token=rt-1')
    expect(r.headers.getSetCookie()[0]).toMatch(/^fps_drive=; .*Max-Age=0/)
  })

  it('uses PUBLIC_URL for the callback address behind a proxy', async () => {
    const r = await call('/api/drive/login', {}, { ...env, PUBLIC_URL: 'https://public.example/' })
    expect(new URL(r.headers.get('location')!).searchParams.get('redirect_uri')).toBe('https://public.example/api/drive/callback')
  })
})
