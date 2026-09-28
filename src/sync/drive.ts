/**
 * Minimal Google Drive client for the browser: Google Identity Services for an
 * access token, then Drive REST v3 with fetch. The `drive.file` scope only
 * lets the app see files it created, which is all it needs.
 */

import { AuthError, type RemoteEntry, type RemoteStore } from './provider'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_NAME = 'Floor Plan Studio'
export const COMPONENTS_FILE = 'components.floorplan.json'

export interface Token {
  token: string
  expiresAt: number
}

export { AuthError }

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (r: TokenResponse) => void
    error_callback?: (e: { type?: string; message?: string }) => void
  }): { requestAccessToken(o?: { prompt?: string }): void }
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth } }
  }
}

let gis: Promise<GoogleOAuth> | null = null

/** Loads the Google sign-in script once. */
export function loadGis(): Promise<GoogleOAuth> {
  const ready = window.google?.accounts?.oauth2
  if (ready) return Promise.resolve(ready)
  gis ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google sign-in did not load.')))
    s.onerror = () => {
      gis = null
      reject(new Error('Could not reach Google sign-in. Check your connection.'))
    }
    document.head.appendChild(s)
  })
  return gis
}

/**
 * Asks Google for an access token. This opens a popup, so call it straight from
 * a click: if the script is already loaded no await happens first, which keeps
 * the browser from treating the popup as unrequested.
 */
export function requestToken(clientId: string, prompt?: '' | 'consent' | 'select_account'): Promise<Token> {
  const run = (oauth: GoogleOAuth) =>
    new Promise<Token>((resolve, reject) => {
      const client = oauth.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google sign-in failed.'))
          // Renew a minute early.
          resolve({ token: r.access_token, expiresAt: Date.now() + (Number(r.expires_in ?? 3600) - 60) * 1000 })
        },
        error_callback: (e) =>
          reject(new Error(e.type === 'popup_closed' ? 'Sign-in window was closed.' : e.message || 'Google sign-in failed.')),
      })
      client.requestAccessToken(prompt === undefined ? undefined : { prompt })
    })
  const ready = window.google?.accounts?.oauth2
  return ready ? run(ready) : loadGis().then(run)
}

export function revokeToken(token: string) {
  window.google?.accounts?.oauth2?.revoke(token)
}

/* ---------- REST ---------- */

export interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
  appProperties?: Record<string, string>
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let r: Response
  try {
    r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
  } catch {
    throw new Error('Could not reach Google Drive. Check your connection.')
  }
  if (r.status === 401) throw new AuthError('Your Google sign-in has expired.')
  if (!r.ok) {
    let msg = `Google Drive error ${r.status}`
    try {
      const body = (await r.json()) as { error?: { message?: string } }
      if (body.error?.message) msg = body.error.message
    } catch {
      // Not JSON; keep the status message.
    }
    throw new Error(msg)
  }
  return r
}

const q = (s: string) => encodeURIComponent(s)

/** The app's folder, created on first use. It is tagged so renaming it does no harm. */
export async function ensureFolder(token: string, known?: string): Promise<string> {
  if (known) {
    try {
      const r = await call(token, `${API}/files/${known}?fields=id,trashed`)
      const f = (await r.json()) as { id: string; trashed?: boolean }
      if (!f.trashed) return f.id
    } catch (e) {
      if (e instanceof AuthError) throw e
    }
  }
  const found = await call(
    token,
    `${API}/files?q=${q("appProperties has { key='fps' and value='root' } and trashed=false")}&fields=files(id)&spaces=drive`,
  )
  const { files } = (await found.json()) as { files: { id: string }[] }
  if (files[0]) return files[0].id
  const made = await call(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', appProperties: { fps: 'root' } }),
  })
  return ((await made.json()) as { id: string }).id
}

export async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let page: string | undefined
  do {
    const url =
      `${API}/files?q=${q(`'${folderId}' in parents and trashed=false`)}` +
      `&fields=${q('nextPageToken,files(id,name,modifiedTime,appProperties)')}&pageSize=1000&spaces=drive` +
      (page ? `&pageToken=${q(page)}` : '')
    const r = await call(token, url)
    const body = (await r.json()) as { files: DriveFile[]; nextPageToken?: string }
    out.push(...body.files)
    page = body.nextPageToken
  } while (page)
  return out
}

export async function readJson<T>(token: string, fileId: string): Promise<T> {
  const r = await call(token, `${API}/files/${fileId}?alt=media`)
  return (await r.json()) as T
}

/** Creates a JSON file in the folder, or replaces the content of an existing one. Returns its id. */
export async function writeJson(
  token: string,
  file: { id?: string; name: string; folderId: string; appProperties: Record<string, string>; data: unknown },
): Promise<string> {
  const boundary = `fps${Math.random().toString(36).slice(2)}`
  const meta = file.id
    ? { name: file.name, appProperties: file.appProperties }
    : { name: file.name, mimeType: 'application/json', parents: [file.folderId], appProperties: file.appProperties }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(file.data)}\r\n--${boundary}--`
  const url = file.id ? `${UPLOAD}/files/${file.id}?uploadType=multipart&fields=id` : `${UPLOAD}/files?uploadType=multipart&fields=id`
  const r = await call(token, url, {
    method: file.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return ((await r.json()) as { id: string }).id
}

/** Moves a file to the Drive bin, so a mistaken delete can still be recovered there. */
export async function trashFile(token: string, fileId: string): Promise<void> {
  await call(token, `${API}/files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

/** Drive as a sync store. Files are tagged with appProperties, so their names are free to change. */
export function driveStore(token: string): RemoteStore {
  return {
    ensureFolder: (known) => ensureFolder(token, known),
    async list(folderId) {
      return (await listFolder(token, folderId)).flatMap((f): RemoteEntry[] => {
        const p = f.appProperties
        if (p?.fps === 'plan' && p.planId) return [{ id: f.id, kind: 'plan' as const, planId: p.planId, updatedAt: Number(p.updatedAt) || 0 }]
        if (p?.fps === 'components') return [{ id: f.id, kind: 'components' as const }]
        return []
      })
    },
    read: (id) => readJson(token, id),
    write: (f) =>
      writeJson(token, {
        id: f.id,
        folderId: f.folderId,
        data: f.data,
        ...(f.kind === 'plan'
          ? { name: `${f.name}.floorplan.json`, appProperties: { fps: 'plan', planId: f.planId, updatedAt: String(f.updatedAt) } }
          : { name: COMPONENTS_FILE, appProperties: { fps: 'components' } }),
      }),
    trash: (id) => trashFile(token, id),
  }
}
