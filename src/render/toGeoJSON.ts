import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import type { Plan, Pt } from '../model/types'
import type { Room } from '../geometry/rooms'
import { rotate } from '../geometry/vec'
import { openingFrame, wallGeometry, wallLength } from '../geometry/walls'
import { OPENING_LABEL } from '../model/defaults'
import { symbolFor } from '../symbols'
import { openingSymbol } from '../symbols/library'
import { arcOutline, roundedRectPts, type Fill, type Primitive } from '../symbols/primitives'
import { THEMES, type PlanColors } from '../theme/themes'
import { FALLBACK_DEF, itemLocalToWorld, itemSize, type DefMap } from './planGeometry'

export type FeatureKind = 'room' | 'wall' | 'opening' | 'item'

export interface PlanFeatureProps {
  id: string
  kind: FeatureKind
  /** Owner name, used for tooltips. */
  name: string
  detail: string
  fill: string
  stroke: string
}

export type PlanFeature = Feature<Geometry, PlanFeatureProps>
export type PlanFeatureCollection = FeatureCollection<Geometry, PlanFeatureProps> & { units: 'cm' }

const fillColor = (c: PlanColors, f: Fill) => (f === 'none' ? 'none' : f === 'paper' ? c.paper : c.ink)
const DASH = 7
const GAP = 4

/** Planar GeoJSON in centimetres with y pointing up (y is negated from the editor). */
const pos = (p: Pt): Position => [round2(p.x), round2(-p.y)]
const round2 = (v: number) => Math.round(v * 100) / 100
const ring = (pts: Pt[]): Position[] => {
  const r = pts.map(pos)
  return [...r, r[0]]
}

/** Splits a polyline into dash segments so dashed symbols survive in plain GeoJSON. */
function dashed(pts: Pt[]): Pt[][] {
  const out: Pt[][] = []
  let on = true
  let left = DASH
  let cur: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]
    const b = pts[i]
    let seg = Math.hypot(b.x - a.x, b.y - a.y)
    while (seg > left) {
      const t = left / seg
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (on) out.push([...cur, p])
      cur = [p]
      on = !on
      seg -= left
      a = p
      left = on ? DASH : GAP
    }
    left -= seg
    if (on) cur.push(b)
  }
  if (on && cur.length > 1) out.push(cur)
  return out
}

/** Converts drawing primitives to geometries, mapping local points through `tf`. */
function primitiveGeometries(prims: Primitive[], tf: (p: Pt) => Pt): { geometry: Geometry; fill: Fill }[] {
  const out: { geometry: Geometry; fill: Fill }[] = []
  const shape = (pts: Pt[], closed: boolean, fill: Fill | undefined, dash: boolean | undefined) => {
    const world = pts.map(tf)
    if (dash) {
      const path = closed ? [...world, world[0]] : world
      out.push({ geometry: { type: 'MultiLineString', coordinates: dashed(path).map((s) => s.map(pos)) }, fill: 'none' })
    } else if (closed) {
      out.push({ geometry: { type: 'Polygon', coordinates: [ring(world)] }, fill: fill ?? 'none' })
    } else {
      out.push({ geometry: { type: 'LineString', coordinates: world.map(pos) }, fill: 'none' })
    }
  }
  const toPts = (xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }))
  for (const p of prims) {
    switch (p.t) {
      case 'line':
        shape([{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }], false, 'none', p.dash)
        break
      case 'rect':
        shape(toPts(roundedRectPts(p.x, p.y, p.w, p.h, p.r ?? 0)), true, p.fill, p.dash)
        break
      case 'ellipse': {
        const pts: Pt[] = []
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2
          pts.push({ x: p.cx + p.rx * Math.cos(a), y: p.cy + p.ry * Math.sin(a) })
        }
        shape(pts, true, p.fill, p.dash)
        break
      }
      case 'poly':
        shape(toPts(p.pts), !!p.closed, p.fill, p.dash)
        break
      case 'arc':
        shape(toPts(arcOutline(p)), !!p.close, p.close ? p.fill : 'none', p.dash)
        break
      case 'text':
        break
    }
  }
  return out
}

export function toGeoJSON(plan: Plan, defs: DefMap, rooms: Room[], colors: PlanColors = THEMES.paper.plan): PlanFeatureCollection {
  const FILL = (f: Fill) => fillColor(colors, f)
  const features: PlanFeature[] = []
  const push = (id: string, kind: FeatureKind, name: string, detail: string, geometry: Geometry, fill: string, stroke: string) =>
    features.push({ type: 'Feature', id, geometry, properties: { id, kind, name, detail, fill, stroke } })

  rooms.forEach((r, i) => {
    const name = r.label?.name ?? `Room ${i + 1}`
    push(`room:${r.key}`, 'room', name, `${r.area.toFixed(2)} m²`, { type: 'Polygon', coordinates: [ring(r.inner)] }, colors.paper, 'none')
  })

  for (const it of plan.items) {
    const def = defs.get(it.defId) ?? FALLBACK_DEF
    const { w, d } = itemSize(it, def)
    const tf = (p: Pt) => itemLocalToWorld(it, w, d, p)
    const name = it.label ? `${def.name} · ${it.label}` : def.name
    primitiveGeometries(symbolFor(def, w, d), tf).forEach((g, i) =>
      push(`item:${it.id}:${i}`, 'item', name, `${Math.round(w)} × ${Math.round(d)} cm`, g.geometry, FILL(g.fill), colors.ink),
    )
  }

  const wallById = new Map(plan.walls.map((w) => [w.id, w]))
  const geo = wallGeometry(plan.walls, plan.openings)
  for (const w of plan.walls) {
    geo.pieces.get(w.id)?.forEach((poly, i) =>
      push(`wall:${w.id}:${i}`, 'wall', 'Wall', `${Math.round(wallLength(w))} cm · ${w.thickness} cm thick`, { type: 'Polygon', coordinates: [ring(poly)] }, colors.ink, 'none'),
    )
  }
  geo.joints.forEach((j, i) => push(`joint:${i}`, 'wall', 'Wall joint', '', { type: 'Polygon', coordinates: [ring(j)] }, colors.ink, 'none'))

  for (const o of plan.openings) {
    const w = wallById.get(o.wallId)
    if (!w) continue
    const { c, angle: ang } = openingFrame(w, o)
    const tf = (p: Pt) => {
      const r = rotate(p, ang)
      return { x: c.x + r.x, y: c.y + r.y }
    }
    primitiveGeometries(openingSymbol(o.kind, o.width, w.thickness, o.flipSide, o.flipHinge), tf).forEach((g, i) =>
      push(`opening:${o.id}:${i}`, 'opening', OPENING_LABEL[o.kind], `${Math.round(o.width)} cm`, g.geometry, FILL(g.fill), colors.ink),
    )
  }

  return { type: 'FeatureCollection', units: 'cm', features }
}
