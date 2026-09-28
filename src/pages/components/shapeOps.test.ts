import { describe, expect, it } from 'vitest'
import type { ComponentDef } from '../../model/types'
import { symbolFor } from '../../symbols'
import { arcPath, type Primitive } from '../../symbols/primitives'
import { moveHandle, shapesBounds, simplify, translatePrim, unwrapSweep } from './shapeOps'

describe('shape designer ops', () => {
  it('resizes a rectangle from a corner, keeping the opposite corner', () => {
    const r: Primitive = { t: 'rect', x: 0, y: 0, w: 10, h: 10 }
    expect(moveHandle(r, 'c2', { x: 30, y: 20 })).toMatchObject({ x: 0, y: 0, w: 30, h: 20 })
    expect(moveHandle(r, 'c0', { x: 20, y: 20 })).toMatchObject({ x: 10, y: 10, w: 10, h: 10 })
  })

  it('drags an arc end to change its sweep, continuing past 180°', () => {
    const a: Primitive = { t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 170 }
    // Pointer at -170° is 190° round from the start, continuing the same way.
    expect(moveHandle(a, 'end', { x: Math.cos((-170 * Math.PI) / 180) * 10, y: Math.sin((-170 * Math.PI) / 180) * 10 })).toMatchObject({ a1: 190 })
  })

  it('unwraps sweeps toward the previous value', () => {
    expect(unwrapSweep(-170, 170)).toBeCloseTo(190)
    expect(unwrapSweep(10, -350)).toBeCloseTo(-350)
  })

  it('measures and moves shapes', () => {
    const shapes: Primitive[] = [
      { t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 90, close: 'sector' },
      { t: 'line', x1: -5, y1: 0, x2: 0, y2: 0 },
    ]
    const bb = shapesBounds(shapes)!
    expect(bb.minX).toBeCloseTo(-5)
    expect(bb.maxX).toBeCloseTo(10)
    expect(bb.maxY).toBeCloseTo(10)
    expect(translatePrim(shapes[1], 5, 1)).toMatchObject({ x1: 0, y1: 1, x2: 5, y2: 1 })
  })

  it('simplifies a freehand stroke', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i % 2 ? 0.1 : 0 }))
    expect(simplify(pts, 0.5)).toHaveLength(2)
  })
})

describe('drawn symbols', () => {
  const def: ComponentDef = {
    id: 'd',
    name: 'Drawn',
    category: 'Other',
    width: 100,
    depth: 50,
    symbol: { kind: 'drawn', shapes: [{ t: 'arc', cx: 50, cy: 50, r: 50, a0: 180, a1: 360, close: 'sector', fill: 'paper' }] },
    builtin: false,
  }

  it('draws as-is at its own size', () => {
    expect(symbolFor(def)).toEqual((def.symbol as { shapes: Primitive[] }).shapes)
  })

  it('stretches when a placed copy is resized, turning uneven arcs into polygons', () => {
    const [even] = symbolFor(def, 200, 100)
    expect(even).toMatchObject({ t: 'arc', cx: 100, cy: 100, r: 100 })
    const [uneven] = symbolFor(def, 200, 50)
    expect(uneven.t).toBe('poly')
    expect(uneven).toMatchObject({ closed: true, fill: 'paper' })
  })

  it('closes sectors back through the centre in SVG', () => {
    const d = arcPath({ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 90, close: 'sector' })
    expect(d.endsWith('L0 0Z')).toBe(true)
    const full = arcPath({ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 360 })
    expect(full.match(/A/g)).toHaveLength(2)
  })
})
