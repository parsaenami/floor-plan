import type { Position } from 'geojson'
import type { Plan, Pt } from '../model/types'
import { formatArea, type Room } from '../geometry/rooms'
import { add, angleDeg, dist, mid, norm, perp, scale, sub } from '../geometry/vec'
import type { DefMap } from '../render/planGeometry'
import { toGeoJSON, type FeatureKind } from '../render/toGeoJSON'

/** Layer names and their ACI colours. */
export const DXF_LAYERS = { WALLS: 7, OPENINGS: 4, FURNITURE: 8, ROOMS: 3, DIMENSIONS: 1 }
type Layer = keyof typeof DXF_LAYERS

const LAYER_OF: Record<FeatureKind, Layer> = { wall: 'WALLS', opening: 'OPENINGS', item: 'FURNITURE', room: 'ROOMS' }

const num = (v: number) => String(Math.round(v * 1e4) / 1e4)
/** Non-ASCII characters as \U+XXXX escapes, which CAD readers decode. */
const str = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)

/**
 * ASCII DXF (R12 / AC1009) in model space at 1:1: one unit is one centimetre, y points up.
 * Outlines come from toGeoJSON, so curved walls and symbols arrive tessellated.
 */
export function toDXF(plan: Plan, defs: DefMap, rooms: Room[]): string {
  const out: string[] = []
  /** Appends group code / value pairs. */
  const g = (...kv: (string | number)[]) => {
    for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), typeof kv[i + 1] === 'number' ? num(kv[i + 1] as number) : (kv[i + 1] as string))
  }
  const poly = (layer: Layer, pts: Position[], closed: boolean) => {
    g(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 1 : 0)
    for (const [x, y] of pts) g(0, 'VERTEX', 8, layer, 10, x, 20, y, 30, 0)
    g(0, 'SEQEND', 8, layer)
  }
  // These take editor points (y down).
  const line = (layer: Layer, a: Pt, b: Pt) => g(0, 'LINE', 8, layer, 10, a.x, 20, -a.y, 30, 0, 11, b.x, 21, -b.y, 31, 0)
  const text = (layer: Layer, p: Pt, h: number, s: string, rot = 0) =>
    g(0, 'TEXT', 8, layer, 10, p.x, 20, -p.y, 30, 0, 40, h, 1, str(s), 50, rot, 72, 1, 11, p.x, 21, -p.y, 31, 0, 73, 2)

  g(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 5, 0, 'ENDSEC')
  g(0, 'SECTION', 2, 'TABLES')
  g(0, 'TABLE', 2, 'LTYPE', 70, 1)
  g(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0)
  g(0, 'ENDTAB')
  g(0, 'TABLE', 2, 'LAYER', 70, Object.keys(DXF_LAYERS).length)
  for (const [name, color] of Object.entries(DXF_LAYERS)) g(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS')
  g(0, 'ENDTAB')
  g(0, 'TABLE', 2, 'STYLE', 70, 1)
  g(0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 10, 3, 'txt', 4, '')
  g(0, 'ENDTAB', 0, 'ENDSEC')

  g(0, 'SECTION', 2, 'ENTITIES')
  for (const f of toGeoJSON(plan, defs, rooms).features) {
    const layer = LAYER_OF[f.properties.kind]
    const geo = f.geometry
    if (geo.type === 'Polygon') poly(layer, geo.coordinates[0].slice(0, -1), true)
    else if (geo.type === 'LineString') poly(layer, geo.coordinates, false)
    else if (geo.type === 'MultiLineString') for (const l of geo.coordinates) poly(layer, l, false)
  }

  for (const r of rooms) {
    if (!r.label) text('ROOMS', r.centroid, 14, formatArea(r.area))
    else {
      text('ROOMS', r.label.point, 20, r.label.name.toUpperCase())
      text('ROOMS', add(r.label.point, { x: 0, y: 26 }), 14, formatArea(r.area))
    }
  }
  for (const l of plan.roomLabels) if (!rooms.some((r) => r.label?.id === l.id)) text('ROOMS', l.point, 20, l.name.toUpperCase())

  // Measured dimensions, drawn like DimLine: extension lines, dimension line, 45° ticks and the length.
  for (const dm of plan.dimensions) {
    const l = dist(dm.a, dm.b)
    if (l < 1) continue
    const d = norm(sub(dm.b, dm.a))
    const n = perp(d)
    const pa = add(dm.a, scale(n, dm.offset))
    const pb = add(dm.b, scale(n, dm.offset))
    const t = scale(norm(add(d, n)), 5)
    const side = dm.offset >= 0 ? 1 : -1
    line('DIMENSIONS', dm.a, add(pa, scale(n, 3 * side)))
    line('DIMENSIONS', dm.b, add(pb, scale(n, 3 * side)))
    line('DIMENSIONS', pa, pb)
    line('DIMENSIONS', sub(pa, t), add(pa, t))
    line('DIMENSIONS', sub(pb, t), add(pb, t))
    let ang = angleDeg(dm.a, dm.b)
    if (ang >= 89.5) ang -= 180
    else if (ang < -90.5) ang += 180
    text('DIMENSIONS', add(mid(pa, pb), scale(n, side * 8)), 10, String(Math.round(l)), -ang)
  }
  g(0, 'ENDSEC', 0, 'EOF')
  return out.join('\n') + '\n'
}
