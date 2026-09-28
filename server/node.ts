import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Converts a Node request to a standard Request. Behind a reverse proxy the
 * public scheme and host come from X-Forwarded-* (Caddy and nginx set them).
 */
export async function toRequest(req: IncomingMessage): Promise<Request> {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http'
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim()
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
    else if (v !== undefined) headers.set(k, v)
  }
  let body: Uint8Array<ArrayBuffer> | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    body = new Uint8Array(Buffer.concat(chunks))
  }
  return new Request(`${proto}://${host}${req.url ?? '/'}`, { method: req.method, headers, body })
}

/** Writes a standard Response to a Node response, keeping every Set-Cookie header. */
export async function sendResponse(res: ServerResponse, r: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  r.headers.forEach((v, k) => {
    if (k !== 'set-cookie') headers[k] = v
  })
  const cookies = r.headers.getSetCookie()
  if (cookies.length) headers['set-cookie'] = cookies
  res.writeHead(r.status, headers)
  res.end(r.body ? Buffer.from(await r.arrayBuffer()) : undefined)
}
