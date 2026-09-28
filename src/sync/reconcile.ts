import type { ComponentDef } from '../model/types'

/** What sync remembers between runs. */
export interface SyncLedger {
  /** Plans known to be on Drive, with the version last seen there. */
  synced: Record<string, { fileId: string; updatedAt: number }>
  /** Plans deleted on this device that may still be on Drive, with when. */
  tombstones: Record<string, number>
}

export interface LocalStamp {
  id: string
  updatedAt: number
}

export interface RemoteStamp {
  fileId: string
  planId: string
  updatedAt: number
}

export type PlanAction =
  | { type: 'upload'; planId: string; fileId?: string }
  | { type: 'download'; planId: string; fileId: string; updatedAt: number }
  | { type: 'delete-local'; planId: string }
  | { type: 'trash-remote'; planId: string; fileId: string }
  /** Drop a tombstone that has nothing left to delete. */
  | { type: 'forget'; planId: string }
  /** Both sides agree; just record it. */
  | { type: 'mark'; planId: string; fileId: string; updatedAt: number }

/**
 * Decides how to bring local plans and Drive files in line. The newer copy of a
 * plan wins. A plan that was on Drive and has gone from there was deleted on
 * another device, so it is deleted here too, unless it was edited since.
 * `hold` lists plans that must not be replaced right now (open in the editor).
 */
export function planActions(local: LocalStamp[], remote: RemoteStamp[], ledger: SyncLedger, hold = new Set<string>()): PlanAction[] {
  const out: PlanAction[] = []
  const byId = new Map<string, RemoteStamp>()
  // Two devices can create the same plan before either syncs; keep the newest file.
  for (const r of [...remote].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (byId.has(r.planId)) out.push({ type: 'trash-remote', planId: r.planId, fileId: r.fileId })
    else byId.set(r.planId, r)
  }
  const locals = new Map(local.map((l) => [l.id, l]))
  const ids = new Set([...locals.keys(), ...byId.keys(), ...Object.keys(ledger.tombstones)])

  for (const id of ids) {
    const l = locals.get(id)
    const r = byId.get(id)
    const deletedAt = ledger.tombstones[id]
    if (deletedAt !== undefined && !l) {
      if (!r) out.push({ type: 'forget', planId: id })
      // Edited elsewhere after we deleted it: keep the edit.
      else if (r.updatedAt > deletedAt) out.push({ type: 'download', planId: id, fileId: r.fileId, updatedAt: r.updatedAt })
      else out.push({ type: 'trash-remote', planId: id, fileId: r.fileId })
      continue
    }
    if (l && r) {
      if (l.updatedAt > r.updatedAt) out.push({ type: 'upload', planId: id, fileId: r.fileId })
      else if (r.updatedAt > l.updatedAt) {
        if (!hold.has(id)) out.push({ type: 'download', planId: id, fileId: r.fileId, updatedAt: r.updatedAt })
      } else if (ledger.synced[id]?.fileId !== r.fileId || ledger.synced[id]?.updatedAt !== r.updatedAt)
        out.push({ type: 'mark', planId: id, fileId: r.fileId, updatedAt: r.updatedAt })
    } else if (l) {
      const seen = ledger.synced[id]
      if (seen && l.updatedAt <= seen.updatedAt) {
        if (!hold.has(id)) out.push({ type: 'delete-local', planId: id })
      } else out.push({ type: 'upload', planId: id })
    } else if (r) {
      out.push({ type: 'download', planId: id, fileId: r.fileId, updatedAt: r.updatedAt })
    }
  }
  return out
}

/** The component library as stored on Drive: components plus deletion times. */
export interface ComponentsDoc {
  components: ComponentDef[]
  deleted: Record<string, number>
}

/**
 * Merges two libraries. Each component keeps its newest version; a deletion
 * wins over versions older than it.
 */
export function mergeComponents(a: ComponentsDoc, b: ComponentsDoc): ComponentsDoc {
  const deleted: Record<string, number> = { ...a.deleted }
  for (const [id, t] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] ?? 0, t)
  const byId = new Map<string, ComponentDef>()
  for (const c of [...a.components, ...b.components]) {
    const cur = byId.get(c.id)
    if (!cur || (c.updatedAt ?? 0) > (cur.updatedAt ?? 0)) byId.set(c.id, c)
  }
  const components = [...byId.values()].filter((c) => deleted[c.id] === undefined || (c.updatedAt ?? 0) > deleted[c.id])
  components.sort((x, y) => x.id.localeCompare(y.id))
  return { components, deleted }
}

/** Order-insensitive comparison of two component lists. */
export function sameComponents(a: ComponentDef[], b: ComponentDef[]): boolean {
  if (a.length !== b.length) return false
  const key = (l: ComponentDef[]) => JSON.stringify([...l].sort((x, y) => x.id.localeCompare(y.id)))
  return key(a) === key(b)
}
