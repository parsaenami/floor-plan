import type { Opening, Pt, Wall, WallAlign } from '../model/types'
import { add, closestOnSegment, dist, eq, lineIntersection, mid, norm, perp, scale, sub } from './vec'

export const JOINT_EPS = 0.5
/** Arc tessellation step, in degrees. */
const ARC_STEP = 5

type WallShape = Pick<Wall, 'a' | 'b' | 'thickness' | 'align' | 'bulge'>

/* ---------- Band: where the thickness sits ---------- */

/** Offsets [lo, hi] of the wall body from its line, measured along the left normal of a→b. */
export function wallBand(w: Pick<Wall, 'thickness' | 'align'>): [number, number] {
  switch (w.align) {
    case 'left':
      return [0, w.thickness]
    case 'right':
      return [-w.thickness, 0]
    default:
      return [-w.thickness / 2, w.thickness / 2]
  }
}

/** Offset of the middle of the wall body from its line (along the left normal). */
export const bandCenter = (w: Pick<Wall, 'thickness' | 'align'>) => {
  const [lo, hi] = wallBand(w)
  return (lo + hi) / 2
}

export const flipAlign = (a: WallAlign | undefined): WallAlign => (a === 'left' ? 'right' : a === 'right' ? 'left' : 'center')

/* ---------- Arcs ---------- */

export interface WallArc {
  c: Pt
  r: number
  /** Start angle (radians, y-down). */
  a0: number
  /** Signed sweep (radians). */
  sweep: number
}

export const isCurved = (w: Pick<Wall, 'bulge'>) => Math.abs(w.bulge ?? 0) > 1e-4

/** Circle through a and b for a curved wall, or null when straight. */
export function wallArc(w: WallShape): WallArc | null {
  const b = w.bulge ?? 0
  const chord = dist(w.a, w.b)
  if (Math.abs(b) < 1e-4 || chord < 1e-6) return null
  const n = perp(norm(sub(w.b, w.a)))
  const apex = add(mid(w.a, w.b), scale(n, (b * chord) / 2))
  const r = (chord * (1 + b * b)) / (4 * Math.abs(b))
  const c = sub(apex, scale(n, Math.sign(b) * r))
  return { c, r, a0: Math.atan2(w.a.y - c.y, w.a.x - c.x), sweep: 4 * Math.atan(b) }
}

/** Bulge for a signed sweep in degrees. */
export const bulgeForSweep = (deg: number) => Math.tan((deg * Math.PI) / 180 / 4)
/** Signed sweep in degrees for a bulge. */
export const sweepOf = (w: Pick<Wall, 'bulge'>) => (4 * Math.atan(w.bulge ?? 0) * 180) / Math.PI

/** Bulge whose arc passes through `p` (the arc's apex follows the pointer across the chord). */
export function bulgeThrough(a: Pt, b: Pt, p: Pt): number {
  const chord = dist(a, b)
  if (chord < 1e-6) return 0
  const n = perp(norm(sub(b, a)))
  const m = mid(a, b)
  const sagitta = (p.x - m.x) * n.x + (p.y - m.y) * n.y
  return (2 * sagitta) / chord
}

/* ---------- Walking along a wall ---------- */

export function wallLength(w: WallShape): number {
  const arc = wallArc(w)
  return arc ? arc.r * Math.abs(arc.sweep) : dist(w.a, w.b)
}

/** Point and unit tangent at arc length `s` from a. Straight walls extrapolate past their ends. */
export function wallFrame(w: WallShape, s: number): { p: Pt; dir: Pt } {
  const arc = wallArc(w)
  if (!arc) {
    const dir = norm(sub(w.b, w.a))
    return { p: add(w.a, scale(dir, s)), dir }
  }
  const l = arc.r * Math.abs(arc.sweep)
  const phi = arc.a0 + arc.sweep * (l ? s / l : 0)
  const sg = Math.sign(arc.sweep)
  return {
    p: { x: arc.c.x + arc.r * Math.cos(phi), y: arc.c.y + arc.r * Math.sin(phi) },
    dir: { x: -Math.sin(phi) * sg, y: Math.cos(phi) * sg },
  }
}

export const pointAlong = (w: WallShape, s: number): Pt => wallFrame(w, s).p

/** Direction of the wall at arc length s, in degrees. */
export function wallAngleAt(w: WallShape, s: number): number {
  const { dir } = wallFrame(w, s)
  return (Math.atan2(dir.y, dir.x) * 180) / Math.PI
}

export const wallAngle = (w: WallShape) => wallAngleAt(w, wallLength(w) / 2)
export const wallDir = (w: WallShape) => norm(sub(w.b, w.a))

/** Points along the wall from s0 to s1, pushed sideways by `offset` (along the left normal). */
export function wallPath(w: WallShape, s0: number, s1: number, offset = 0): Pt[] {
  const arc = wallArc(w)
  const at = (s: number) => {
    const f = wallFrame(w, s)
    return add(f.p, scale(perp(f.dir), offset))
  }
  if (!arc) return [at(s0), at(s1)]
  const deg = (Math.abs(s1 - s0) / arc.r) * (180 / Math.PI)
  const n = Math.max(1, Math.ceil(deg / ARC_STEP))
  return Array.from({ length: n + 1 }, (_, i) => at(s0 + ((s1 - s0) * i) / n))
}

/** The wall line itself, tessellated. */
export const wallCenterline = (w: WallShape) => wallPath(w, 0, wallLength(w))

/** Outline of the wall body between arc lengths `from` and `to`, with square ends. */
export function wallPolygon(w: WallShape, from = 0, to = wallLength(w)): Pt[] {
  const [lo, hi] = wallBand(w)
  return [...wallPath(w, from, to, lo), ...wallPath(w, to, from, hi)]
}

export function closestOnWall(p: Pt, w: WallShape): { point: Pt; t: number; s: number; d: number } {
  const arc = wallArc(w)
  if (!arc) {
    const c = closestOnSegment(p, w.a, w.b)
    return { ...c, s: c.t * dist(w.a, w.b) }
  }
  const l = arc.r * Math.abs(arc.sweep)
  const phi = Math.atan2(p.y - arc.c.y, p.x - arc.c.x)
  const tau = Math.PI * 2
  // Angle travelled from a in the sweep direction, 0..2π.
  const along = (((phi - arc.a0) * Math.sign(arc.sweep)) % tau + tau) % tau
  const t = along / Math.abs(arc.sweep)
  if (t <= 1) {
    const point = { x: arc.c.x + arc.r * Math.cos(phi), y: arc.c.y + arc.r * Math.sin(phi) }
    return { point, t, s: t * l, d: dist(p, point) }
  }
  const da = dist(p, w.a)
  const db = dist(p, w.b)
  return da <= db ? { point: w.a, t: 0, s: 0, d: da } : { point: w.b, t: 1, s: l, d: db }
}

/* ---------- Openings ---------- */

export function clampOpeningOffset(w: WallShape, width: number, offset: number): number {
  const l = wallLength(w)
  const half = Math.min(width, l) / 2
  return Math.max(half, Math.min(l - half, offset))
}

/** Where an opening's symbol is drawn: the middle of the wall body at its offset. */
export function openingFrame(w: Wall, o: Opening): { c: Pt; angle: number } {
  const f = wallFrame(w, o.offset)
  return { c: add(f.p, scale(perp(f.dir), bandCenter(w))), angle: (Math.atan2(f.dir.y, f.dir.x) * 180) / Math.PI }
}

/** Intervals of arc length that remain solid after cutting the wall's openings. */
export function solidIntervals(w: Wall, openings: Opening[]): [number, number][] {
  const l = wallLength(w)
  const cuts = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as [number, number])
    .sort((p, q) => p[0] - q[0])
  const out: [number, number][] = []
  let cursor = 0
  for (const [s, e] of cuts) {
    if (s > cursor) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (l > cursor) out.push([cursor, l])
  return out
}

/* ---------- Joints ---------- */

/** Every wall endpoint that sits on the given point. */
export function endpointsAt(walls: Wall[], p: Pt, eps = JOINT_EPS): { wallId: string; end: 'a' | 'b' }[] {
  const out: { wallId: string; end: 'a' | 'b' }[] = []
  for (const w of walls) {
    if (eq(w.a, p, eps)) out.push({ wallId: w.id, end: 'a' })
    if (eq(w.b, p, eps)) out.push({ wallId: w.id, end: 'b' })
  }
  return out
}

/** A wall leaving a joint: its outgoing direction and band relative to that direction. */
interface Ray {
  wall: Wall
  end: 'a' | 'b' | null
  dir: Pt
  lo: number
  hi: number
  angle: number
}

/** Corner points of a wall end, on its lo and hi band edges. */
type EndCut = { lo: Pt; hi: Pt }

export interface WallGeometry {
  /** Solid pieces of each wall, joined to their neighbours. */
  pieces: Map<string, Pt[][]>
  /** Fills for joints where three or more walls meet. */
  joints: Pt[][]
}

/**
 * Solid wall outlines with mitred joints. At each joint the walls are sorted by
 * direction and every band edge is extended to meet the facing edge of its
 * neighbour. A wall ending on another wall's side (a T-junction) meets its face.
 */
export function wallGeometry(walls: Wall[], openings: Opening[]): WallGeometry {
  const cuts = new Map<string, { a?: EndCut; b?: EndCut }>()
  const joints: Pt[][] = []
  const seen: Pt[] = []

  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      const p = w[end]
      if (seen.some((q) => eq(q, p, JOINT_EPS))) continue
      seen.push(p)
      const rays = raysAt(walls, p)
      if (!rays.some((r) => r.end)) continue
      rays.sort((q, r) => q.angle - r.angle)
      const corners = rays.map((r, i) => miter(p, r, rays[(i - 1 + rays.length) % rays.length], rays.length))
      rays.forEach((r, i) => {
        if (!r.end) return
        // Left (hi) edge meets the previous ray; the right (lo) edge meets the next one.
        const hi = corners[i]
        const lo = corners[(i + 1) % rays.length]
        const loPt = rays.length === 1 ? add(p, scale(perp(r.dir), r.lo)) : lo
        const entry = cuts.get(r.wall.id) ?? {}
        // At end b the ray runs against the wall, so its sides swap.
        entry[r.end] = r.end === 'a' ? { lo: loPt, hi } : { lo: hi, hi: loPt }
        cuts.set(r.wall.id, entry)
      })
      if (rays.length >= 3) joints.push(corners)
    }
  }

  const pieces = new Map<string, Pt[][]>()
  for (const w of walls) {
    const l = wallLength(w)
    const [lo, hi] = wallBand(w)
    const c = cuts.get(w.id) ?? {}
    pieces.set(
      w.id,
      solidIntervals(w, openings).map(([s0, s1]) => {
        const loEdge = wallPath(w, s0, s1, lo)
        const hiEdge = wallPath(w, s1, s0, hi)
        if (s0 <= 1e-6 && c.a) {
          loEdge[0] = c.a.lo
          hiEdge[hiEdge.length - 1] = c.a.hi
        }
        if (s1 >= l - 1e-6 && c.b) {
          loEdge[loEdge.length - 1] = c.b.lo
          hiEdge[0] = c.b.hi
        }
        return [...loEdge, ...hiEdge]
      }),
    )
  }
  return { pieces, joints }
}

function raysAt(walls: Wall[], p: Pt): Ray[] {
  const rays: Ray[] = []
  const push = (wall: Wall, end: Ray['end'], dir: Pt, lo: number, hi: number) =>
    rays.push({ wall, end, dir, lo, hi, angle: Math.atan2(dir.y, dir.x) })
  for (const w of walls) {
    const l = wallLength(w)
    if (l < 1e-6) continue
    const [lo, hi] = wallBand(w)
    if (eq(w.a, p, JOINT_EPS)) push(w, 'a', wallFrame(w, 0).dir, lo, hi)
    if (eq(w.b, p, JOINT_EPS)) push(w, 'b', scale(wallFrame(w, l).dir, -1), -hi, -lo)
    if (!eq(w.a, p, JOINT_EPS) && !eq(w.b, p, JOINT_EPS)) {
      const c = closestOnWall(p, w)
      if (c.d <= JOINT_EPS && c.s > 0 && c.s < l) {
        // p sits on this wall's side: it continues both ways through the joint.
        const f = wallFrame(w, c.s)
        push(w, null, f.dir, lo, hi)
        push(w, null, scale(f.dir, -1), -hi, -lo)
      }
    }
  }
  return rays
}

/** Where ray r's hi edge meets the lo edge of the ray before it. */
function miter(p: Pt, r: Ray, prev: Ray, count: number): Pt {
  const flush = add(p, scale(perp(r.dir), r.hi))
  if (count < 2 || prev === r) return flush
  const hit = lineIntersection(flush, r.dir, add(p, scale(perp(prev.dir), prev.lo)), prev.dir)
  if (!hit) return flush
  // Very sharp corners would spike far out; cap the miter.
  const limit = 4 * Math.max(Math.abs(r.hi), Math.abs(r.lo), Math.abs(prev.hi), Math.abs(prev.lo), 1)
  return dist(hit, p) > limit ? flush : hit
}

/* ---------- Lookup ---------- */

export function nearestWall(walls: Wall[], p: Pt, maxDist: number): { wall: Wall; t: number; s: number; point: Pt; d: number } | null {
  let best: { wall: Wall; t: number; s: number; point: Pt; d: number } | null = null
  for (const w of walls) {
    const c = closestOnWall(p, w)
    const [lo, hi] = wallBand(w)
    const reach = maxDist + Math.max(Math.abs(lo), Math.abs(hi))
    if (c.d <= reach && (!best || c.d < best.d)) best = { wall: w, ...c }
  }
  return best
}

/** Rectangle room: walls running along the given rectangle, clockwise, so `left` puts their thickness outside. */
export function rectRoomWalls(a: Pt, b: Pt): [Pt, Pt][] {
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const c = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
  return [
    [c[0], c[1]],
    [c[1], c[2]],
    [c[2], c[3]],
    [c[3], c[0]],
  ]
}
