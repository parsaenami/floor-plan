import { createStore, del, entries, get, set } from 'idb-keyval'
import type { ComponentDef, Plan } from '../model/types'
import { DEFAULT_SETTINGS } from '../model/defaults'

const store = createStore('floor-plan-studio', 'kv')
const PLAN_PREFIX = 'plan:'
const COMPONENTS_KEY = 'components'

/** Fills fields added after a plan was saved, so old saves keep loading. */
export function normalizePlan(p: Plan): Plan {
  return {
    ...p,
    walls: p.walls ?? [],
    openings: p.openings ?? [],
    items: p.items ?? [],
    roomLabels: p.roomLabels ?? [],
    dimensions: p.dimensions ?? [],
    settings: { ...DEFAULT_SETTINGS, ...p.settings },
  }
}

export async function listPlans(): Promise<Plan[]> {
  const all = await entries<string, Plan>(store)
  return all
    .filter(([k]) => typeof k === 'string' && k.startsWith(PLAN_PREFIX))
    .map(([, v]) => normalizePlan(v))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export const savePlan = (plan: Plan) => set(PLAN_PREFIX + plan.id, plan, store)
export const deletePlan = (id: string) => del(PLAN_PREFIX + id, store)

export async function loadComponents(): Promise<ComponentDef[]> {
  return (await get<ComponentDef[]>(COMPONENTS_KEY, store)) ?? []
}

export const saveComponents = (defs: ComponentDef[]) => set(COMPONENTS_KEY, defs, store)

/* ---------- Sync bookkeeping ---------- */

const SYNC_KEY = 'sync'

export interface SyncMeta {
  /** The user turned sync on. */
  connected: boolean
  /** Where to; missing means Google Drive, from before Dropbox was added. */
  provider?: 'drive' | 'dropbox'
  /** OAuth client ID entered in the app, when not built in. */
  clientId?: string
  folderId?: string
  synced: Record<string, { fileId: string; updatedAt: number }>
  tombstones: Record<string, number>
  deletedComponents: Record<string, number>
  lastSync?: number
}

export const emptySyncMeta = (): SyncMeta => ({ connected: false, synced: {}, tombstones: {}, deletedComponents: {} })

export async function loadSyncMeta(): Promise<SyncMeta> {
  return { ...emptySyncMeta(), ...((await get<SyncMeta>(SYNC_KEY, store)) ?? {}) }
}

export const saveSyncMeta = (meta: SyncMeta) => set(SYNC_KEY, meta, store)
