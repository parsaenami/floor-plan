import { describe, expect, it } from 'vitest'
import type { Plan } from './types'
import { DEFAULT_FLOOR_NAME, newPlan, samplePlan } from './defaults'
import { activeFloor, addFloor, deleteFloor, floorView, moveFloor, renameFloor, switchFloor, withFloors } from './floors'
import { normalizePlan } from '../persistence/db'
import { parseFile, planFile } from '../persistence/importExport'

const legacy = (): Plan => {
  const p = samplePlan('Old')
  delete p.floors
  delete p.floorId
  return p
}

describe('floors', () => {
  it('starts new plans with one ground floor', () => {
    const p = newPlan('New')
    expect(p.floors).toEqual([{ id: p.floorId, name: DEFAULT_FLOOR_NAME }])
  })

  it('migrates plans saved before floors to a single floor', () => {
    const old = legacy()
    const p = normalizePlan(old)
    expect(p.floors).toHaveLength(1)
    expect(activeFloor(p)?.name).toBe(DEFAULT_FLOOR_NAME)
    expect(p.walls).toEqual(old.walls)
    expect(p.items).toEqual(old.items)
  })

  it('repairs a dangling active floor id', () => {
    const p = withFloors({ ...newPlan('X'), floorId: 'gone' })
    expect(p.floorId).toBe(p.floors![0].id)
  })

  it('adds an empty floor and switches back without losing content', () => {
    const p = samplePlan('S')
    const ground = p.floorId!
    const walls = p.walls
    const upper = addFloor(p, 'First floor')
    expect(p.floorId).toBe(upper.id)
    expect(p.walls).toEqual([])
    expect(p.items).toEqual([])
    p.walls.push({ id: 'w', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 10 })

    switchFloor(p, ground)
    expect(p.walls).toEqual(walls)
    expect(p.floors!.find((f) => f.id === ground)!.walls).toBeUndefined()
    expect(p.floors!.find((f) => f.id === upper.id)!.walls!.map((w) => w.id)).toEqual(['w'])

    switchFloor(p, upper.id)
    expect(p.walls.map((w) => w.id)).toEqual(['w'])
  })

  it('adds a floor to a legacy plan', () => {
    const p = legacy()
    const n = p.walls.length
    addFloor(p, 'Loft')
    expect(p.floors!.map((f) => f.name)).toEqual([DEFAULT_FLOOR_NAME, 'Loft'])
    expect(p.floors![0].walls).toHaveLength(n)
  })

  it('shows any floor as a single-floor plan', () => {
    const p = samplePlan('S')
    const ground = p.floorId!
    const upper = addFloor(p, 'Up').id
    expect(floorView(p, upper)).toBe(p)
    const g = floorView(p, ground)
    expect(g.walls).toHaveLength(8)
    expect(g.floorId).toBe(ground)
    expect(p.walls).toEqual([])
  })

  it('deletes floors, keeping at least one', () => {
    const p = samplePlan('S')
    const ground = p.floorId!
    const upper = addFloor(p, 'Up').id
    deleteFloor(p, upper)
    expect(p.floors!.map((f) => f.id)).toEqual([ground])
    expect(p.floorId).toBe(ground)
    expect(p.walls).toHaveLength(8)
    deleteFloor(p, ground)
    expect(p.floors).toHaveLength(1)

    addFloor(p, 'Up')
    switchFloor(p, ground)
    deleteFloor(p, ground)
    expect(p.floors!.map((f) => f.name)).toEqual(['Up'])
    expect(p.walls).toEqual([])
  })

  it('renames and reorders floors', () => {
    const p = newPlan('P')
    const a = p.floorId!
    const b = addFloor(p, 'B').id
    renameFloor(p, a, 'A')
    moveFloor(p, b, 0)
    expect(p.floors!.map((f) => f.name)).toEqual(['B', 'A'])
    expect(p.floors!.map((f) => f.id)).toEqual([b, a])
  })

  it('round-trips every floor through a plan file', () => {
    const p = samplePlan('S')
    const custom = { id: 'custom:x', name: 'X', category: 'Other' as const, width: 10, depth: 10, symbol: { kind: 'builtin' as const, key: 'x' }, builtin: false }
    p.items.push({ id: 'i', defId: custom.id, x: 0, y: 0, rotation: 0 })
    addFloor(p, 'Up')
    const file = planFile(p, [custom])
    expect(file.components).toEqual([custom])
    const parsed = parseFile(JSON.stringify(file))
    if (parsed.type !== 'plan') throw new Error('expected a plan')
    expect(parsed.plan.floors).toEqual(p.floors)
    expect(parsed.plan.floorId).toBe(p.floorId)
  })
})
