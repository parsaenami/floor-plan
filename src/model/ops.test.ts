import { describe, expect, it } from 'vitest'
import type { Plan, SelectionRef } from './types'
import { newPlan } from './defaults'
import { allLocked, deleteSelection, rotateSelection, toggleLock, translateSelection } from './ops'

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
