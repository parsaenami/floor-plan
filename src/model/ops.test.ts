import { describe, expect, it } from 'vitest'
import type { Plan, SelectionRef } from './types'
import { newPlan } from './defaults'
import {
  allLocked,
  canRotate,
  clipCenter,
  copySelection,
  deleteSelection,
  duplicateSelection,
  moveJoint,
  orientWalls,
  pasteClip,
  rotateSelection,
  toggleLock,
  translateSelection,
} from './ops'

function plan(): Plan {
  const p = newPlan('t')
  p.walls.push({ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 10 }, { id: 'w2', a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, thickness: 10 })
  p.openings.push(
    { id: 'o1', wallId: 'w1', kind: 'door', offset: 100, width: 80, flipSide: false, flipHinge: false },
    { id: 'o2', wallId: 'w2', kind: 'window', offset: 100, width: 60, flipSide: false, flipHinge: false },
  )
  p.items.push({ id: 'i1', defId: 'builtin:bed', x: 200, y: 150, rotation: 0 })
  p.roomLabels.push({ id: 'l1', point: { x: 100, y: 100 }, name: 'Room' })
  p.dimensions.push({ id: 'd1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, offset: 20 })
  return p
}

const sel = (...refs: [SelectionRef['kind'], string][]) => refs.map(([kind, id]) => ({ kind, id }))

describe('copy / paste', () => {
  it('copies openings with their walls and leaves the plan untouched', () => {
    const p = plan()
    const clip = copySelection(p, sel(['wall', 'w1'], ['item', 'i1']))
    expect(clip.walls.map((w) => w.id)).toEqual(['w1'])
    expect(clip.openings.map((o) => o.id)).toEqual(['o1'])
    expect(clip.items.map((i) => i.id)).toEqual(['i1'])
    clip.walls[0].a.x = 999
    expect(p.walls[0].a.x).toBe(0)
  })

  it('pastes with fresh ids and remaps openings onto the new walls', () => {
    const p = plan()
    const clip = copySelection(p, sel(['wall', 'w1'], ['wall', 'w2'], ['label', 'l1'], ['dimension', 'd1']))
    const target = newPlan('other')
    const out = pasteClip(target, clip, { x: 10, y: 5 })
    expect(target.walls).toHaveLength(2)
    expect(target.walls.every((w) => !['w1', 'w2'].includes(w.id))).toBe(true)
    expect(target.walls[0].a).toEqual({ x: 10, y: 5 })
    const wallIds = new Set(target.walls.map((w) => w.id))
    expect(target.openings).toHaveLength(2)
    expect(target.openings.every((o) => wallIds.has(o.wallId) && !['o1', 'o2'].includes(o.id))).toBe(true)
    expect(target.openings.find((o) => o.kind === 'door')!.wallId).toBe(target.walls[0].id)
    expect(target.roomLabels[0].point).toEqual({ x: 110, y: 105 })
    expect(target.dimensions[0].b).toEqual({ x: 410, y: 5 })
    expect(out.map((s) => s.kind)).toEqual(['wall', 'wall', 'label', 'dimension'])
  })

  it('pastes a lone opening onto its wall in the same plan, drops it elsewhere', () => {
    const p = plan()
    const clip = copySelection(p, sel(['opening', 'o1']))
    const out = pasteClip(p, clip, { x: 20, y: 20 })
    expect(out).toHaveLength(1)
    const copy = p.openings.find((o) => o.id === out[0].id)!
    expect(copy).toMatchObject({ wallId: 'w1', offset: 190 })
    const other = newPlan('other')
    expect(pasteClip(other, clip, { x: 0, y: 0 })).toEqual([])
    expect(other.openings).toEqual([])
  })

  it('pasting twice gives distinct ids', () => {
    const p = plan()
    const clip = copySelection(p, sel(['item', 'i1']))
    const a = pasteClip(p, clip, { x: 0, y: 0 })
    const b = pasteClip(p, clip, { x: 0, y: 0 })
    expect(a[0].id).not.toBe(b[0].id)
    expect(p.items).toHaveLength(3)
  })

  it('finds the centre of the copied bounds', () => {
    const p = plan()
    expect(clipCenter(copySelection(p, sel(['wall', 'w1'], ['wall', 'w2'])))).toEqual({ x: 200, y: 150 })
    expect(clipCenter(copySelection(p, sel(['opening', 'o1'])))).toBeNull()
  })

  it('duplicates via the same path', () => {
    const p = plan()
    const out = duplicateSelection(p, sel(['wall', 'w1']), { x: 20, y: 20 })
    expect(out).toHaveLength(1)
    expect(p.walls).toHaveLength(3)
    expect(p.openings.filter((o) => o.wallId === out[0].id)).toHaveLength(1)
  })
})

describe('locked items', () => {
  const plan = (): Plan => {
    const p = newPlan('lock')
    p.items = [
      { id: 'a', defId: 'x', x: 0, y: 0, rotation: 0, locked: true },
      { id: 'b', defId: 'x', x: 100, y: 0, rotation: 0 },
    ]
    p.roomLabels = [{ id: 'l', point: { x: 0, y: 0 }, name: 'Room' }]
    return p
  }
  const sel = (...ids: string[]): SelectionRef[] => ids.map((id) => ({ kind: 'item', id }))
  const item = (p: Plan, id: string) => p.items.find((i) => i.id === id)

  it('do not move or rotate', () => {
    const p = plan()
    translateSelection(p, sel('a', 'b'), { x: 10, y: 5 })
    expect(item(p, 'a')).toMatchObject({ x: 0, y: 0 })
    expect(item(p, 'b')).toMatchObject({ x: 110, y: 5 })
    rotateSelection(p, sel('a', 'b'), 90)
    expect(item(p, 'a')!.rotation).toBe(0)
    // Only the unlocked item rotates, about its own centre.
    expect(item(p, 'b')).toMatchObject({ x: 110, y: 5, rotation: 90 })
  })

  it('survive deletion while the rest of the selection goes', () => {
    const p = plan()
    deleteSelection(p, [...sel('a', 'b'), { kind: 'label', id: 'l' }])
    expect(p.items.map((i) => i.id)).toEqual(['a'])
    expect(p.roomLabels).toEqual([])
  })

  it('can rotate only while an unlocked item is selected', () => {
    const p = plan()
    expect(canRotate(p, sel('a'))).toBe(false)
    expect(canRotate(p, sel('a', 'b'))).toBe(true)
    expect(canRotate(p, [{ kind: 'label', id: 'l' }])).toBe(false)
  })

  it('toggle: locks all unless all are locked', () => {
    const p = plan()
    expect(allLocked(p, sel('a'))).toBe(true)
    expect(allLocked(p, sel('a', 'b'))).toBe(false)
    expect(allLocked(p, [])).toBe(false)
    toggleLock(p, sel('a', 'b'))
    expect(allLocked(p, sel('a', 'b'))).toBe(true)
    toggleLock(p, sel('a', 'b'))
    expect(p.items.some((i) => 'locked' in i)).toBe(false)
  })
})

describe('locked walls', () => {
  // w1 runs along the top, w2 down the right; they meet at (400, 0).
  const locked = () => {
    const p = plan()
    p.walls[0].locked = true
    return p
  }
  const wall = (p: Plan, id: string) => p.walls.find((w) => w.id === id)!
  const walls = (...ids: string[]): SelectionRef[] => ids.map((id) => ({ kind: 'wall', id }))

  it('do not move, and pin the joints they share', () => {
    const p = locked()
    translateSelection(p, walls('w1', 'w2'), { x: 10, y: 10 })
    expect(wall(p, 'w1')).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } })
    // w2 keeps its end on the locked wall and moves the free one.
    expect(wall(p, 'w2')).toMatchObject({ a: { x: 400, y: 0 }, b: { x: 410, y: 310 } })
    moveJoint(p, { x: 400, y: 0 }, { x: 450, y: 50 })
    expect(wall(p, 'w2').a).toEqual({ x: 400, y: 0 })
  })

  it('survive deletion along with their openings', () => {
    const p = locked()
    deleteSelection(p, walls('w1', 'w2'))
    expect(p.walls.map((w) => w.id)).toEqual(['w1'])
    expect(p.openings.map((o) => o.id)).toEqual(['o1'])
  })

  it('keep their thickness side when walls are reoriented', () => {
    const p = newPlan('room')
    const c = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]
    p.walls = c.map((a, i) => ({ id: `r${i}`, a, b: c[(i + 1) % 4], thickness: 10 }))
    p.walls[0].locked = true
    orientWalls(p, undefined, true)
    expect(wall(p, 'r0').align).toBeUndefined()
    expect(p.walls.slice(1).every((w) => w.align)).toBe(true)
  })

  it('lock and unlock with items in one toggle', () => {
    const p = plan()
    const sel: SelectionRef[] = [...walls('w1'), { kind: 'item', id: 'i1' }]
    p.items.push({ id: 'i1', defId: 'x', x: 0, y: 0, rotation: 0 })
    toggleLock(p, sel)
    expect(wall(p, 'w1').locked).toBe(true)
    expect(allLocked(p, sel)).toBe(true)
    toggleLock(p, sel)
    expect('locked' in wall(p, 'w1')).toBe(false)
  })
})
