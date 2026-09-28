import { describe, expect, it } from 'vitest'
import type { ComponentDef } from '../model/types'
import { samplePlan } from '../model/defaults'
import { decodeShare, encodeShare, mergeShared } from './share'

const chair: ComponentDef = { id: 'c1', name: 'Chair', category: 'Living', width: 50, depth: 50, symbol: { kind: 'preset', shape: 'rect' }, builtin: false }

describe('share links', () => {
  it('round-trips a plan and the custom components it uses', async () => {
    const plan = samplePlan('Flat')
    plan.items.push({ id: 'i1', defId: 'c1', x: 0, y: 0, rotation: 0 })
    const data = await encodeShare(plan, [chair, { ...chair, id: 'c2' }])
    expect(data).toMatch(/^v1\.[\w-]+$/)
    const out = await decodeShare(data)
    expect(out.plan.id).not.toBe(plan.id)
    expect({ ...out.plan, id: plan.id, createdAt: plan.createdAt, updatedAt: plan.updatedAt }).toEqual(plan)
    expect(out.components).toEqual([chair])
  })

  it('rejects broken and unknown links', async () => {
    await expect(decodeShare('')).rejects.toThrow(/broken/)
    await expect(decodeShare('v1.not-deflate')).rejects.toThrow(/broken/)
    await expect(decodeShare('v9.abc')).rejects.toThrow(/newer/)
  })

  it('reuses identical components and re-ids clashing ones', () => {
    const plan = samplePlan('Flat')
    plan.items = [
      { id: 'i1', defId: 'c1', x: 0, y: 0, rotation: 0 },
      { id: 'i2', defId: 'c2', x: 0, y: 0, rotation: 0 },
    ]
    const existing = new Map([
      ['c1', { ...chair, updatedAt: 5 }],
      ['c2', { ...chair, id: 'c2' }],
    ])
    const out = mergeShared(plan, [chair, { ...chair, id: 'c2', name: 'Stool' }], existing)
    expect(out.components).toHaveLength(1)
    const id = out.components[0].id
    expect(id).not.toBe('c2')
    expect(out.plan.items.map((i) => i.defId)).toEqual(['c1', id])
  })
})
