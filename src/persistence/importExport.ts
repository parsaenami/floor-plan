import type { ComponentDef, Plan } from '../model/types'
import { uid } from '../model/defaults'
import { normalizePlan } from './db'

const APP = 'floor-plan-studio'
const VERSION = 1

export interface PlanFile {
  app: typeof APP
  version: number
  type: 'plan'
  plan: Plan
  /** Custom components the plan uses, so it opens correctly elsewhere. */
  components: ComponentDef[]
}

export interface LibraryFile {
  app: typeof APP
  version: number
  type: 'components'
  components: ComponentDef[]
}

export function planFile(plan: Plan, custom: ComponentDef[]): PlanFile {
  const items = [plan.items, ...(plan.floors ?? []).map((f) => f.items ?? [])].flat()
  const used = new Set(items.map((i) => i.defId))
  return { app: APP, version: VERSION, type: 'plan', plan, components: custom.filter((c) => used.has(c.id)) }
}

export function libraryFile(custom: ComponentDef[]): LibraryFile {
  return { app: APP, version: VERSION, type: 'components', components: custom }
}

export type ParsedFile = { type: 'plan'; plan: Plan; components: ComponentDef[] } | { type: 'components'; components: ComponentDef[] }

export function parseFile(text: string): ParsedFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (!isObj(data) || data.app !== APP) throw new Error('This is not a Floor Plan Studio file.')
  if (typeof data.version !== 'number' || data.version > VERSION) throw new Error('This file was made by a newer version of the app.')
  const components = Array.isArray(data.components) ? data.components.filter(isComponent) : []
  if (data.type === 'components') return { type: 'components', components }
  if (data.type === 'plan' && isPlan(data.plan)) {
    const now = Date.now()
    // Imported plans get a fresh id so they never overwrite an existing plan.
    const plan = normalizePlan({ ...data.plan, id: uid(), createdAt: now, updatedAt: now })
    return { type: 'plan', plan, components }
  }
  throw new Error('The file does not contain a valid plan.')
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isPlan = (v: unknown): v is Plan => isObj(v) && typeof v.name === 'string' && Array.isArray(v.walls) && Array.isArray(v.items)
const isComponent = (v: unknown): v is ComponentDef =>
  isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.width === 'number' && typeof v.depth === 'number' && isObj(v.symbol)

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadJson = (data: unknown, filename: string) =>
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename)

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'plan'

export function pickFile(accept = '.json,application/json'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
