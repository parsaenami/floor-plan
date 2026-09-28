import { create } from 'zustand'
import type { Plan } from '../model/types'
import { newPlan, samplePlan, uid } from '../model/defaults'
import { deletePlan, listPlans, savePlan } from '../persistence/db'
import { emitLocalChange } from '../sync/events'

export type Template = 'blank' | 'sample'

interface PlansState {
  plans: Plan[]
  loaded: boolean
  load: () => Promise<void>
  create: (name: string, template: Template) => Promise<Plan>
  upsert: (plan: Plan) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  duplicate: (id: string) => Promise<Plan | undefined>
  remove: (id: string) => Promise<void>
}

export const usePlans = create<PlansState>((set, get) => ({
  plans: [],
  loaded: false,

  async load() {
    const plans = await listPlans()
    set({ plans, loaded: true })
  },

  async create(name, template) {
    const plan = template === 'sample' ? samplePlan(name) : newPlan(name)
    await get().upsert(plan)
    return plan
  },

  async upsert(plan) {
    await savePlan(plan)
    set((s) => {
      const rest = s.plans.filter((p) => p.id !== plan.id)
      return { plans: [plan, ...rest].sort((a, b) => b.updatedAt - a.updatedAt) }
    })
    emitLocalChange({ type: 'plan-saved' })
  },

  async rename(id, name) {
    const plan = get().plans.find((p) => p.id === id)
    if (plan) await get().upsert({ ...plan, name, updatedAt: Date.now() })
  },

  async duplicate(id) {
    const plan = get().plans.find((p) => p.id === id)
    if (!plan) return undefined
    const now = Date.now()
    const copy: Plan = { ...structuredClone(plan), id: uid(), name: `${plan.name} copy`, createdAt: now, updatedAt: now }
    await get().upsert(copy)
    return copy
  },

  async remove(id) {
    await deletePlan(id)
    set((s) => ({ plans: s.plans.filter((p) => p.id !== id) }))
    emitLocalChange({ type: 'plan-deleted', id })
  },
}))
