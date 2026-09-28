import type { Pt } from '../model/types'

export const pt = (x: number, y: number): Pt => ({ x, y })
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
export const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x
export const len = (a: Pt) => Math.hypot(a.x, a.y)
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5)
export const eq = (a: Pt, b: Pt, eps = 0.5) => dist(a, b) <= eps

export function norm(a: Pt): Pt {
  const l = len(a)
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

/** Left-hand normal in y-down space (rotates the direction 90° counter-clockwise on screen). */
export const perp = (a: Pt): Pt => ({ x: a.y, y: -a.x })

export function rotate(p: Pt, deg: number, origin: Pt = { x: 0, y: 0 }): Pt {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
}

export const angleDeg = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

/** Parameter t (0..1, unclamped) of the projection of p on segment ab. */
export function projectT(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  return l2 === 0 ? 0 : dot(sub(p, a), ab) / l2
}

export function closestOnSegment(p: Pt, a: Pt, b: Pt): { point: Pt; t: number; d: number } {
  const t = Math.max(0, Math.min(1, projectT(p, a, b)))
  const point = lerp(a, b, t)
  return { point, t, d: dist(p, point) }
}

/** Intersection of segments ab and cd (inclusive of endpoints), or null. */
export function segmentIntersection(a: Pt, b: Pt, c: Pt, d: Pt, eps = 1e-9): { point: Pt; t: number; u: number } | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denom = cross(r, s)
  if (Math.abs(denom) < eps) return null
  const ca = sub(c, a)
  const t = cross(ca, s) / denom
  const u = cross(ca, r) / denom
  const tol = 1e-6
  if (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol) return null
  return { point: lerp(a, b, t), t, u }
}

/** Intersection of infinite lines p1+t*d1 and p2+u*d2. */
export function lineIntersection(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const denom = cross(d1, d2)
  if (Math.abs(denom) < 1e-9) return null
  const t = cross(sub(p2, p1), d2) / denom
  return add(p1, scale(d1, t))
}

export function polygonSignedArea(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

export function polygonCentroid(pts: Pt[]): Pt {
  const a = polygonSignedArea(pts)
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bboxOf(points: Pt[]): BBox | null {
  if (!points.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export const round = (v: number, step: number) => Math.round(v / step) * step
