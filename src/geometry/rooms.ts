import type { Pt, RoomLabel, Wall } from '../model/types'
import {
  add,
  closestOnSegment,
  dist,
  lineIntersection,
  norm,
  perp,
  pointInPolygon,
  polygonCentroid,
  polygonSignedArea,
  scale,
  segmentIntersection,
  sub,
} from './vec'
import { isCurved, wallBand, wallCenterline } from './walls'

export interface Room {
  /** Stable-ish key derived from the sorted node ids of the face. */
  key: string
  /** Wall-centreline polygon. */
  outline: Pt[]
  /** Inner-face polygon (outline inset by the part of each wall body inside the room). */
  inner: Pt[]
  /** Per edge of `inner`: whether it is a piece of a curved wall (no dimension is drawn for those). */
  curved: boolean[]
  /** Net floor area in m². */
  area: number
  centroid: Pt
  label?: RoomLabel
}

interface Node {
  id: number
  p: Pt
  out: HalfEdge[]
}

interface HalfEdge {
  from: Node
  to: Node
  angle: number
  /** How far the wall body reaches to the right of travel (into a face traced this way). */
  inset: number
  curved: boolean
  visited: boolean
}

/** A straight piece of a wall line; curved walls become several. */
interface Segment {
  a: Pt
  b: Pt
  lo: number
  hi: number
  curved: boolean
}

function segmentsOf(walls: Wall[]): Segment[] {
  const out: Segment[] = []
  for (const w of walls) {
    const [lo, hi] = wallBand(w)
    const pts = wallCenterline(w)
    const curved = isCurved(w)
    for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], lo, hi, curved })
  }
  return out
}

const MERGE_EPS = 0.5
const MIN_AREA_CM2 = 500

/**
 * Finds the enclosed rooms formed by the walls. Walls are split wherever they
 * touch or cross, then faces of the planar graph are traced by always taking
 * the tightest turn. Interior faces have positive signed area in y-down space.
 */
export function detectRooms(allWalls: Wall[], labels: RoomLabel[] = []): Room[] {
  const walls = segmentsOf(allWalls)
  const nodes: Node[] = []
  const nodeAt = (p: Pt): Node => {
    for (const n of nodes) if (dist(n.p, p) <= MERGE_EPS) return n
    const n: Node = { id: nodes.length, p, out: [] }
    nodes.push(n)
    return n
  }

  // Split parameters per wall: endpoints, crossings, and T-junctions.
  const splits = walls.map(() => new Set<number>([0, 1]))
  for (let i = 0; i < walls.length; i++) {
    const wi = walls[i]
    for (let j = i + 1; j < walls.length; j++) {
      const wj = walls[j]
      const hit = segmentIntersection(wi.a, wi.b, wj.a, wj.b)
      if (hit) {
        splits[i].add(clamp01(hit.t))
        splits[j].add(clamp01(hit.u))
        continue
      }
      // Collinear/near-touching endpoints (T-junction that falls just short).
      for (const [w, k, other] of [
        [wi, i, wj],
        [wj, j, wi],
      ] as const) {
        for (const e of [other.a, other.b]) {
          const c = closestOnSegment(e, w.a, w.b)
          if (c.d <= MERGE_EPS) splits[k].add(clamp01(c.t))
        }
      }
    }
  }

  const edgeKeys = new Set<string>()
  walls.forEach((w, i) => {
    const ts = [...splits[i]].sort((a, b) => a - b)
    for (let k = 0; k < ts.length - 1; k++) {
      const p = lerpPt(w.a, w.b, ts[k])
      const q = lerpPt(w.a, w.b, ts[k + 1])
      const u = nodeAt(p)
      const v = nodeAt(q)
      if (u === v) continue
      const key = u.id < v.id ? `${u.id}-${v.id}` : `${v.id}-${u.id}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      // Travelling a→b the right side is -normal; travelling back it is +normal.
      u.out.push(makeHalf(u, v, Math.max(0, -w.lo), w.curved))
      v.out.push(makeHalf(v, u, Math.max(0, w.hi), w.curved))
    }
  })

  for (const n of nodes) n.out.sort((a, b) => a.angle - b.angle)

  const rooms: Room[] = []
  for (const n of nodes) {
    for (const start of n.out) {
      if (start.visited) continue
      const face: HalfEdge[] = []
      let e: HalfEdge | undefined = start
      let guard = 0
      while (e && !e.visited && guard++ < 10000) {
        e.visited = true
        face.push(e)
        e = nextHalfEdge(e)
      }
      if (face.length < 3) continue
      const outline = face.map((h) => h.from.p)
      const signed = polygonSignedArea(outline)
      if (signed <= MIN_AREA_CM2) continue
      const cleaned = removeSpikes(face)
      if (cleaned.length < 3) continue
      const inner = insetPolygon(cleaned)
      const innerArea = Math.abs(polygonSignedArea(inner))
      rooms.push({
        key: face
          .map((h) => h.from.id)
          .sort((a, b) => a - b)
          .join('.'),
        outline: cleaned.map((h) => h.from.p),
        inner,
        curved: cleaned.map((h) => h.curved),
        area: innerArea / 10000,
        centroid: polygonCentroid(inner),
      })
    }
  }

  // Attach labels: the first label found inside a room names it.
  for (const r of rooms) {
    r.label = labels.find((l) => pointInPolygon(l.point, r.outline))
  }
  return rooms
}

function nextHalfEdge(e: HalfEdge): HalfEdge | undefined {
  const out = e.to.out
  const idx = out.findIndex((h) => h.to === e.from)
  if (idx < 0) return undefined
  return out[(idx - 1 + out.length) % out.length]
}

function makeHalf(from: Node, to: Node, inset: number, curved: boolean): HalfEdge {
  return { from, to, angle: Math.atan2(to.p.y - from.p.y, to.p.x - from.p.x), inset, curved, visited: false }
}

/** Removes back-and-forth edges produced by dangling walls inside a face. */
function removeSpikes(face: HalfEdge[]): HalfEdge[] {
  const list = [...face]
  let changed = true
  while (changed && list.length > 2) {
    changed = false
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      const b = list[(i + 1) % list.length]
      if (a.from === b.to) {
        const j = (i + 1) % list.length
        if (j > i) {
          list.splice(j, 1)
          list.splice(i, 1)
        } else {
          list.splice(i, 1)
          list.splice(j, 1)
        }
        changed = true
        break
      }
    }
  }
  return list
}

/** Offsets every edge of a positively oriented face inward by the wall body on that side. */
function insetPolygon(face: HalfEdge[]): Pt[] {
  const lines = face.map((h) => {
    const d = norm(sub(h.to.p, h.from.p))
    // Interior lies to the right of travel for positive area in y-down space.
    const inward = scale(perp(d), -1)
    return { p: add(h.from.p, scale(inward, h.inset)), d }
  })
  const pts: Pt[] = []
  for (let i = 0; i < lines.length; i++) {
    const prev = lines[(i - 1 + lines.length) % lines.length]
    const cur = lines[i]
    pts.push(lineIntersection(prev.p, prev.d, cur.p, cur.d) ?? cur.p)
  }
  return pts
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export const formatArea = (m2: number) => `${m2.toFixed(2)} m²`
