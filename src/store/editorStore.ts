import { create } from 'zustand'
import type { OpeningKind, Plan, SelectionRef } from '../model/types'
import { switchFloor } from '../model/floors'

export type ToolId = 'select' | 'wall' | 'arc' | 'room' | 'opening' | 'measure' | 'label' | 'pan'

export interface Camera {
  /** World coordinate at the top-left of the viewport. */
  x: number
  y: number
  /** Screen pixels per centimetre. */
  zoom: number
}

const HISTORY_LIMIT = 200

interface EditorState {
  plan: Plan | null
  past: Plan[]
  future: Plan[]
  /** Plan snapshot taken when a drag started; committed to history on end. */
  txBase: Plan | null
  tool: ToolId
  openingKind: OpeningKind
  selection: SelectionRef[]
  camera: Camera

  load: (plan: Plan) => void
  close: () => void
  /** Applies a mutation to a copy of the plan and records it in history. */
  commit: (mutate: (plan: Plan) => void) => void
  begin: () => void
  /** Mutation during a drag, applied to the snapshot from `begin`; recorded on `end`. */
  update: (mutate: (plan: Plan) => void) => void
  end: () => void
  cancel: () => void
  undo: () => void
  redo: () => void
  /** Shows another floor; not an undo step. */
  setFloor: (id: string) => void
  setTool: (tool: ToolId, openingKind?: OpeningKind) => void
  setSelection: (sel: SelectionRef[]) => void
  setCamera: (camera: Camera) => void
}

function applyTo(plan: Plan, mutate: (p: Plan) => void): Plan {
  const next = structuredClone(plan)
  mutate(next)
  next.updatedAt = Date.now()
  return next
}

/** Removes selection entries whose entities no longer exist. */
function pruneSelection(plan: Plan, sel: SelectionRef[]): SelectionRef[] {
  const exists = (r: SelectionRef) => {
    switch (r.kind) {
      case 'wall':
        return plan.walls.some((w) => w.id === r.id)
      case 'opening':
        return plan.openings.some((o) => o.id === r.id)
      case 'item':
        return plan.items.some((i) => i.id === r.id)
      case 'label':
        return plan.roomLabels.some((l) => l.id === r.id)
      case 'dimension':
        return plan.dimensions.some((d) => d.id === r.id)
    }
  }
  const next = sel.filter(exists)
  return next.length === sel.length ? sel : next
}

export const useEditor = create<EditorState>((set, get) => ({
  plan: null,
  past: [],
  future: [],
  txBase: null,
  tool: 'select',
  openingKind: 'door',
  selection: [],
  camera: { x: -100, y: -100, zoom: 1 },

  load(plan) {
    set({ plan, past: [], future: [], txBase: null, selection: [], tool: 'select' })
  },

  close() {
    set({ plan: null, past: [], future: [], txBase: null, selection: [] })
  },

  commit(mutate) {
    const { plan, past } = get()
    if (!plan) return
    const next = applyTo(plan, mutate)
    set({
      plan: next,
      past: [...past, plan].slice(-HISTORY_LIMIT),
      future: [],
      selection: pruneSelection(next, get().selection),
    })
  },

  begin() {
    set({ txBase: get().plan })
  },

  update(mutate) {
    const base = get().txBase ?? get().plan
    if (!base) return
    set({ plan: applyTo(base, mutate) })
  },

  end() {
    const { txBase, plan, past } = get()
    if (txBase && plan && txBase !== plan) {
      set({ past: [...past, txBase].slice(-HISTORY_LIMIT), future: [], txBase: null })
    } else {
      set({ txBase: null })
    }
  },

  cancel() {
    const { txBase } = get()
    if (txBase) set({ plan: txBase, txBase: null })
  },

  undo() {
    const { past, plan, future } = get()
    if (!past.length || !plan) return
    const prev = past[past.length - 1]
    set({ plan: prev, past: past.slice(0, -1), future: [plan, ...future], selection: pruneSelection(prev, get().selection) })
  },

  redo() {
    const { past, plan, future } = get()
    if (!future.length || !plan) return
    const next = future[0]
    set({ plan: next, past: [...past, plan], future: future.slice(1), selection: pruneSelection(next, get().selection) })
  },

  setFloor(id) {
    const { plan } = get()
    if (!plan || plan.floorId === id) return
    const next = { ...plan }
    switchFloor(next, id)
    set({ plan: next, txBase: null, selection: [] })
  },

  setTool(tool, openingKind) {
    set((s) => ({ tool, openingKind: openingKind ?? s.openingKind }))
  },

  setSelection(selection) {
    set({ selection })
  },

  setCamera(camera) {
    set({ camera })
  },
}))
