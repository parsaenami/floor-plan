import { describe, expect, it } from 'vitest'
import type { ComponentDef, Plan, Pt, Wall } from '../model/types'
import { newPlan, samplePlan } from '../model/defaults'
import { BUILTIN_COMPONENTS } from '../symbols/library'
import { DOOR_HEIGHT, planScene, SILL_HEIGHT, WALL_HEIGHT } from './scene'

const defs = new Map<string, ComponentDef>(BUILTIN_COMPONENTS.map((d) => [d.id, d]))

let n = 0
const wall = (a: Pt, b: Pt): Wall => ({ id: `w${n++}`, a, b, thickness: 10 })
const box = (): Plan => {
  const plan = newPlan('Box')
  plan.walls = [
    wall({ x: 0, y: 0 }, { x: 400, y: 0 }),
    wall({ x: 400, y: 0 }, { x: 400, y: 300 }),
    wall({ x: 400, y: 300 }, { x: 0, y: 300 }),
    wall({ x: 0, y: 300 }, { x: 0, y: 0 }),
  ]
  return plan
}
const spans = (plan: Plan, kind: string) =>
  planScene(plan, defs)
    .solids.filter((s) => s.kind === kind)
    .map((s) => [s.z0, s.z1])

describe('planScene', () => {
  it('is empty for an empty plan', () => {
    expect(planScene(newPlan('Empty'), defs)).toEqual({ solids: [], bounds: null })
  })

  it('raises each wall to full height and floors the enclosed room', () => {
    const scene = planScene(box(), defs)
    expect(spans(box(), 'wall')).toEqual(Array(4).fill([0, WALL_HEIGHT]))
    expect(spans(box(), 'floor')).toHaveLength(1)
    expect(scene.bounds).toEqual({ min: { x: -5, y: -5 }, max: { x: 405, y: 305 } })
  })

  it('leaves a header over a door and a sill, header and pane at a window', () => {
    const plan = box()
    plan.openings = [
      { id: 'd', wallId: plan.walls[0].id, kind: 'door', offset: 200, width: 90, flipSide: false, flipHinge: false },
      { id: 'o', wallId: plan.walls[1].id, kind: 'window', offset: 150, width: 120, flipSide: false, flipHinge: false },
    ]
    const walls = spans(plan, 'wall')
    // Each opening splits its wall in two full-height pieces.
    expect(walls.filter(([z0, z1]) => z0 === 0 && z1 === WALL_HEIGHT)).toHaveLength(6)
    expect(walls).toContainEqual([DOOR_HEIGHT, WALL_HEIGHT])
    expect(walls).toContainEqual([0, SILL_HEIGHT])
    expect(spans(plan, 'glass')).toEqual([[SILL_HEIGHT, DOOR_HEIGHT]])
  })

  it('stands items on the floor at their height, hangs wall cabinets and lays flat ones down', () => {
    const plan = newPlan('Items')
    const item = (defId: string) => ({ id: defId, defId, x: 0, y: 0, rotation: 0 })
    plan.items = [item('builtin:wardrobe'), item('builtin:wall-cabinet'), item('builtin:rug'), item('builtin:round-table')]
    const solids = planScene(plan, defs).solids
    expect(solids.map((s) => [s.z0, s.z1])).toEqual([
      [0, 210],
      [145, 215],
      [0, 2],
      [0, 75],
    ])
    expect(solids[0].footprint).toHaveLength(4)
    expect(solids[3].footprint.length).toBeGreaterThan(4)
  })

  it('builds the sample plan without degenerate footprints', () => {
    const { solids } = planScene(samplePlan('Sample'), defs)
    expect(solids.length).toBeGreaterThan(0)
    for (const s of solids) {
      expect(s.footprint.length).toBeGreaterThanOrEqual(3)
      expect(s.z1).toBeGreaterThan(s.z0)
    }
  })
})
