import { useMemo } from 'react'
import { create } from 'zustand'
import type { ComponentDef } from '../model/types'
import { BUILTIN_COMPONENTS } from '../symbols/library'
import { loadComponents, saveComponents } from '../persistence/db'
import type { DefMap } from '../render/planGeometry'
import { emitLocalChange } from '../sync/events'

interface ComponentsState {
  custom: ComponentDef[]
  loaded: boolean
  load: () => Promise<void>
  upsert: (def: ComponentDef) => Promise<void>
  /** Adds or replaces components; `stamp` marks them as edited now (off when syncing in remote copies). */
  upsertMany: (defs: ComponentDef[], stamp?: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Swaps in a whole library (used when sync merges in another device's changes). */
  replaceAll: (defs: ComponentDef[]) => Promise<void>
}

export const useComponents = create<ComponentsState>((set, get) => ({
  custom: [],
  loaded: false,

  async load() {
    set({ custom: await loadComponents(), loaded: true })
  },

  async upsert(def) {
    await get().upsertMany([def])
  },

  async upsertMany(defs, stamp = true) {
    if (stamp) defs = defs.map((d) => ({ ...d, updatedAt: Date.now() }))
    const ids = new Set(defs.map((d) => d.id))
    const custom = [...get().custom.filter((d) => !ids.has(d.id)), ...defs]
    set({ custom })
    await saveComponents(custom)
    emitLocalChange({ type: 'components-saved' })
  },

  async remove(id) {
    const custom = get().custom.filter((d) => d.id !== id)
    set({ custom })
    await saveComponents(custom)
    emitLocalChange({ type: 'component-deleted', id })
  },

  async replaceAll(custom) {
    set({ custom })
    await saveComponents(custom)
  },
}))

export function useAllComponents(): ComponentDef[] {
  const custom = useComponents((s) => s.custom)
  return useMemo(() => [...BUILTIN_COMPONENTS, ...custom], [custom])
}

export function useDefMap(): DefMap {
  const all = useAllComponents()
  return useMemo(() => new Map(all.map((d) => [d.id, d])), [all])
}
