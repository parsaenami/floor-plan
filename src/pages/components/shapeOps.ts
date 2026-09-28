import type { Pt } from '../../model/types'
import { bboxOf, type BBox } from '../../geometry/vec'
import { arcOutline, roundedRectPts, type Primitive } from '../../symbols/primitives'

/** Points that describe a shape's extent (arcs and ellipses are sampled). */
export function primPoints(p: Primitive): Pt[] {
  const pt = ([x, y]: [number, number]) => ({ x, y })
  switch (p.t) {
    case 'line':
      return [
        { x: p.x1, y: p.y1 },
        { x: p.x2, y: p.y2 },
      ]
    case 'poly':
      return p.pts.map(pt)
    case 'rect':
      return roundedRectPts(p.x, p.y, p.w, p.h, 0).map(pt)
    case 'ellipse':
      return Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2
        return { x: p.cx + p.rx * Math.cos(a), y: p.cy + p.ry * Math.sin(a) }
      })
    case 'arc':
      return arcOutline(p).map(pt)
    case 'text':
      return [{ x: p.x, y: p.y }]
  }
}

export function shapesBounds(shapes: Primitive[]): BBox | null {
  return bboxOf(shapes.flatMap(primPoints))
}

export function translatePrim(p: Primitive, dx: number, dy: number): Primitive {
  switch (p.t) {
    case 'line':
      return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
    case 'poly':
      return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy]) }
    case 'rect':
      return { ...p, x: p.x + dx, y: p.y + dy }
    case 'ellipse':
    case 'arc':
      return { ...p, cx: p.cx + dx, cy: p.cy + dy }
    case 'text':
      return { ...p, x: p.x + dx, y: p.y + dy }
  }
}

/** Points the user can snap to: vertices, centres and arc ends. */
export function snapTargets(p: Primitive): Pt[] {
  switch (p.t) {
    case 'ellipse':
      return [{ x: p.cx, y: p.cy }]
    case 'arc':
      // Centre, start and end.
      return handlesOf(p).map((h) => h.p)
    default:
      return primPoints(p)
  }
}

export type HandleId = string

/** Drag handles for a shape, keyed so `moveHandle` knows what each one edits. */
export function handlesOf(p: Primitive): { id: HandleId; p: Pt }[] {
  switch (p.t) {
    case 'line':
      return [
        { id: 'p1', p: { x: p.x1, y: p.y1 } },
        { id: 'p2', p: { x: p.x2, y: p.y2 } },
      ]
    case 'poly':
      return p.pts.map(([x, y], i) => ({ id: `v${i}`, p: { x, y } }))
    case 'rect':
      return boxCorners(p.x, p.y, p.w, p.h)
    case 'ellipse':
      return boxCorners(p.cx - p.rx, p.cy - p.ry, p.rx * 2, p.ry * 2)
    case 'arc': {
      const r0 = (p.a0 * Math.PI) / 180
      const r1 = (p.a1 * Math.PI) / 180
      return [
        { id: 'center', p: { x: p.cx, y: p.cy } },
        { id: 'start', p: { x: p.cx + p.r * Math.cos(r0), y: p.cy + p.r * Math.sin(r0) } },
        { id: 'end', p: { x: p.cx + p.r * Math.cos(r1), y: p.cy + p.r * Math.sin(r1) } },
      ]
    }
    case 'text':
      return []
  }
}

const boxCorners = (x: number, y: number, w: number, h: number) => [
  { id: 'c0', p: { x, y } },
  { id: 'c1', p: { x: x + w, y } },
  { id: 'c2', p: { x: x + w, y: y + h } },
  { id: 'c3', p: { x, y: y + h } },
]

/** Box corner opposite to handle c0..c3. */
function opposite(id: HandleId, x: number, y: number, w: number, h: number): Pt {
  const i = Number(id.slice(1))
  return [
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
    { x: x + w, y },
  ][i]
}

const deg = (v: Pt, c: Pt) => (Math.atan2(v.y - c.y, v.x - c.x) * 180) / Math.PI

/** Moves one handle of a shape to `to`. */
export function moveHandle(p: Primitive, id: HandleId, to: Pt): Primitive {
  switch (p.t) {
    case 'line':
      return id === 'p1' ? { ...p, x1: to.x, y1: to.y } : { ...p, x2: to.x, y2: to.y }
    case 'poly': {
      const i = Number(id.slice(1))
      return { ...p, pts: p.pts.map((q, k) => (k === i ? [to.x, to.y] : q)) }
    }
    case 'rect': {
      const o = opposite(id, p.x, p.y, p.w, p.h)
      return { ...p, x: Math.min(o.x, to.x), y: Math.min(o.y, to.y), w: Math.abs(to.x - o.x), h: Math.abs(to.y - o.y) }
    }
    case 'ellipse': {
      const o = opposite(id, p.cx - p.rx, p.cy - p.ry, p.rx * 2, p.ry * 2)
      return { ...p, cx: (o.x + to.x) / 2, cy: (o.y + to.y) / 2, rx: Math.abs(to.x - o.x) / 2, ry: Math.abs(to.y - o.y) / 2 }
    }
    case 'arc': {
      const c = { x: p.cx, y: p.cy }
      if (id === 'center') return { ...p, cx: to.x, cy: to.y }
      const sweep = p.a1 - p.a0
      if (id === 'start') {
        // Rotate and resize, keeping the sweep.
        const a0 = deg(to, c)
        return { ...p, r: Math.max(1, Math.hypot(to.x - c.x, to.y - c.y)), a0, a1: a0 + sweep }
      }
      return { ...p, a1: p.a0 + unwrapSweep(deg(to, c) - p.a0, sweep) }
    }
    case 'text':
      return p
  }
}

/**
 * Picks the sweep for a pointer angle that stays closest to the previous sweep,
 * so dragging past 180° keeps going the same way instead of flipping sides.
 */
export function unwrapSweep(delta: number, previous: number): number {
  let best = delta
  for (let k = -2; k <= 2; k++) {
    const c = delta + 360 * k
    if (Math.abs(c - previous) < Math.abs(best - previous)) best = c
  }
  return Math.max(-360, Math.min(360, best))
}

/** Ramer–Douglas–Peucker: drops points closer than `eps` to the simplified line. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy)
  let idx = 0
  let max = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const d = l === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / l
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max <= eps) return [a, b]
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)]
}

export const SWEEP_NAMES: Record<number, string> = { 90: 'quarter', 180: 'half', 270: 'three quarters', 360: 'full circle' }
