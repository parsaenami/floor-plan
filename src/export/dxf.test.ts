import { describe, expect, it } from 'vitest'
import { newPlan, samplePlan } from '../model/defaults'
import { detectRooms } from '../geometry/rooms'
import { BUILTIN_COMPONENTS } from '../symbols/library'
import { DXF_LAYERS, toDXF } from './dxf'

const defs = new Map(BUILTIN_COMPONENTS.map((d) => [d.id, d]))

/** Group code / value pairs. */
function parse(dxf: string): [number, string][] {
  const lines = dxf.trimEnd().split('\n')
  expect(lines.length % 2).toBe(0)
  const out: [number, string][] = []
  for (let i = 0; i < lines.length; i += 2) {
    expect(lines[i]).toMatch(/^-?\d+$/)
    out.push([Number(lines[i]), lines[i + 1]])
  }
  return out
}

/** Entities in the ENTITIES section, with their layer. */
function entities(pairs: [number, string][]) {
  const start = pairs.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && pairs[i - 1][1] === 'SECTION')
  const out: { type: string; layer: string }[] = []
  for (let i = start + 1; pairs[i][1] !== 'ENDSEC'; i++) {
    if (pairs[i][0] === 0) out.push({ type: pairs[i][1], layer: '' })
    else if (pairs[i][0] === 8) out[out.length - 1].layer = pairs[i][1]
  }
  return out
}

describe('toDXF', () => {
  const plan = samplePlan('Sample')
  plan.dimensions.push({ id: 'd1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, offset: 40 })
  const rooms = detectRooms(plan.walls, plan.roomLabels)
  const pairs = parse(toDXF(plan, defs, rooms))
  const ents = entities(pairs)
  const count = (type: string, layer: string) => ents.filter((e) => e.type === type && e.layer === layer).length

  it('has balanced sections and ends with EOF', () => {
    const zeros = pairs.filter(([c]) => c === 0).map(([, v]) => v)
    expect(zeros.filter((v) => v === 'SECTION').length).toBe(3)
    expect(zeros.filter((v) => v === 'ENDSEC').length).toBe(3)
    expect(pairs[pairs.length - 1]).toEqual([0, 'EOF'])
    expect(pairs.slice(0, 4)).toEqual([[0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1009']])
  })

  it('declares every layer', () => {
    const layers = pairs.filter(([c, v], i) => c === 2 && pairs[i - 1][1] === 'LAYER' && v !== 'LAYER').map(([, v]) => v)
    expect(layers).toEqual(Object.keys(DXF_LAYERS))
    for (const e of ents) if (e.type !== 'VERTEX' && e.type !== 'SEQEND') expect(Object.keys(DXF_LAYERS)).toContain(e.layer)
  })

  it('puts content on every layer', () => {
    expect(count('POLYLINE', 'WALLS')).toBeGreaterThanOrEqual(plan.walls.length)
    expect(count('POLYLINE', 'OPENINGS')).toBeGreaterThanOrEqual(plan.openings.length)
    expect(count('POLYLINE', 'FURNITURE')).toBeGreaterThanOrEqual(plan.items.length)
    expect(count('POLYLINE', 'ROOMS')).toBe(rooms.length)
    expect(count('TEXT', 'ROOMS')).toBeGreaterThanOrEqual(rooms.length)
    expect(count('LINE', 'DIMENSIONS')).toBe(5)
    expect(count('TEXT', 'DIMENSIONS')).toBe(1)
  })

  it('closes every polyline with a SEQEND and at least two vertices', () => {
    for (let i = 0; i < ents.length; i++) {
      if (ents[i].type !== 'POLYLINE') continue
      let j = i + 1
      while (ents[j].type === 'VERTEX') j++
      expect(ents[j].type).toBe('SEQEND')
      expect(j - i - 1).toBeGreaterThanOrEqual(2)
    }
  })

  // The dimension sits 40 cm above its line on screen, so its text lands at y > 40 in DXF.
  it('flips y and writes the dimension length', () => {
    const texts = pairs.filter(([c]) => c === 1).map(([, v]) => v)
    expect(texts).toContain('400')
    const i = pairs.findIndex(([c, v]) => c === 1 && v === '400')
    const y = pairs.slice(0, i).reverse().find(([c]) => c === 20)!
    expect(Number(y[1])).toBeGreaterThan(40)
    expect(texts.some((t) => t.endsWith('m\\U+00B2'))).toBe(true)
  })

  it('handles an empty plan', () => {
    expect(entities(parse(toDXF(newPlan('Empty'), defs, [])))).toEqual([])
  })
})
