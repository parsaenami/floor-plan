import type { ComponentDef, Item, Plan } from '../model/types'
import { uid } from '../model/defaults'
import { parseFile, planFile } from './importExport'

/** Link format: `v1.` + base64url(deflate-raw(plan file JSON)). Bump the prefix if that changes. */
const PREFIX = 'v1.'

const pipe = (bytes: BufferSource, t: CompressionStream | DecompressionStream) =>
  new Response(new Blob([bytes]).stream().pipeThrough(t)).arrayBuffer()

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function encodeShare(plan: Plan, custom: ComponentDef[]): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(planFile(plan, custom)))
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeShare(data: string): Promise<{ plan: Plan; components: ComponentDef[] }> {
  if (!data.startsWith(PREFIX)) throw new Error(data.match(/^v\d+\./) ? 'This link was made by a newer version of the app.' : 'This link is incomplete or broken.')
  let text: string
  try {
    text = new TextDecoder().decode(await pipe(fromBase64Url(data.slice(PREFIX.length)), new DecompressionStream('deflate-raw')))
  } catch {
    throw new Error('This link is incomplete or broken.')
  }
  const parsed = parseFile(text)
  if (parsed.type !== 'plan') throw new Error('This link does not contain a plan.')
  return parsed
}

export const shareUrl = async (plan: Plan, custom: ComponentDef[]) => `${location.origin}/share#${await encodeShare(plan, custom)}`

const same = (a: ComponentDef, b: ComponentDef) =>
  JSON.stringify([a.name, a.category, a.width, a.depth, a.height, a.symbol]) === JSON.stringify([b.name, b.category, b.width, b.depth, b.height, b.symbol])

/**
 * Prepares shared components for the library: identical ones are reused, and
 * ones whose id is taken by a different component get a new id in the plan too.
 */
export function mergeShared(plan: Plan, components: ComponentDef[], existing: Map<string, ComponentDef>) {
  const ids = new Map<string, string>()
  const add: ComponentDef[] = []
  for (const c of components) {
    const ex = existing.get(c.id)
    if (ex && same(ex, c)) continue
    const id = ex ? uid() : c.id
    ids.set(c.id, id)
    add.push({ ...c, id, builtin: false })
  }
  const remap = (items: Item[]) => items.map((i) => (ids.has(i.defId) ? { ...i, defId: ids.get(i.defId)! } : i))
  const floors = plan.floors?.map((f) => (f.items ? { ...f, items: remap(f.items) } : f))
  return { plan: { ...plan, items: remap(plan.items), ...(floors && { floors }) }, components: add }
}
