import { describe, expect, it } from 'vitest'
import { samplePlan, newPlan } from '../model/defaults'
import { detectRooms } from '../geometry/rooms'
import { BUILTIN_COMPONENTS } from '../symbols/library'
import { toGeoJSON } from './toGeoJSON'

const defs = new Map(BUILTIN_COMPONENTS.map((d) => [d.id, d]))

describe('toGeoJSON', () => {
  const plan = samplePlan('Sample')
  const fc = toGeoJSON(plan, defs, detectRooms(plan.walls, plan.roomLabels))

  it('produces a valid feature collection with every kind of feature', () => {
    expect(fc.type).toBe('FeatureCollection')
    const kinds = new Set(fc.features.map((f) => f.properties.kind))
    expect([...kinds].sort()).toEqual(['item', 'opening', 'room', 'wall'])
    for (const f of fc.features) expect(f.properties.id).toBeTruthy()
    expect(new Set(fc.features.map((f) => f.properties.id)).size).toBe(fc.features.length)
  })

  it('closes every polygon ring', () => {
    for (const f of fc.features) {
      if (f.geometry.type !== 'Polygon') continue
      const ring = f.geometry.coordinates[0]
      expect(ring[0]).toEqual(ring[ring.length - 1])
    }
  })

  it('flips y so the plan reads north-up', () => {
    const wall = plan.walls[1] // right wall, from (1000, 0) down to (1000, 700)
    const parts = fc.features.filter((x) => x.properties.id.startsWith(`wall:${wall.id}`))
    const ys = parts.flatMap((f) => (f.geometry as GeoJSON.Polygon).coordinates[0].map((p) => p[1]))
    expect(Math.max(...ys)).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeLessThanOrEqual(-700)
  })

  it('tessellates door swings into line strings', () => {
    const swings = fc.features.filter((f) => f.properties.kind === 'opening' && f.geometry.type === 'LineString')
    expect(swings.some((f) => (f.geometry as GeoJSON.LineString).coordinates.length > 5)).toBe(true)
  })

  it('handles an empty plan', () => {
    expect(toGeoJSON(newPlan('Empty'), defs, []).features).toEqual([])
  })
})
