import type { Pt, Wall } from '../model/types'
import { dist, round } from './vec'
import { closestOnWall } from './walls'

export type SnapKind = 'endpoint' | 'wall' | 'grid' | 'angle' | 'none'

export interface SnapResult {
  p: Pt
  kind: SnapKind
}

export interface SnapOptions {
  walls: Wall[]
  grid: number
  /** Snap radius in world units (cm). */
  radius: number
  enabled: boolean
  /** Anchor for angle locking (the previous point of a drawn segment). */
  from?: Pt
  /** Lock the segment direction to multiples of 45°. */
  angleLock?: boolean
  /** Wall ids to ignore (e.g. the one being edited). */
  exclude?: Set<string>
}

/** Locks p to the nearest 45° ray from `from`, preserving the projected length. */
export function lockAngle(from: Pt, p: Pt, stepDeg = 45): Pt {
  const dx = p.x - from.x
  const dy = p.y - from.y
  const l = Math.hypot(dx, dy)
  if (l === 0) return p
  const step = (stepDeg * Math.PI) / 180
  const a = Math.round(Math.atan2(dy, dx) / step) * step
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const proj = dx * ux + dy * uy
  return { x: from.x + ux * proj, y: from.y + uy * proj }
}

export function snapPoint(raw: Pt, o: SnapOptions): SnapResult {
  if (!o.enabled) return { p: raw, kind: 'none' }
  const walls = o.exclude ? o.walls.filter((w) => !o.exclude!.has(w.id)) : o.walls

  // 1. Existing endpoints win.
  let best: SnapResult | null = null
  let bestD = o.radius
  for (const w of walls) {
    for (const e of [w.a, w.b]) {
      const d = dist(raw, e)
      if (d <= bestD) {
        bestD = d
        best = { p: e, kind: 'endpoint' }
      }
    }
  }
  if (best) return best

  // 2. Angle lock from the anchor, then round the length to the grid.
  if (o.from && o.angleLock) {
    const locked = lockAngle(o.from, raw)
    const dx = locked.x - o.from.x
    const dy = locked.y - o.from.y
    const l = Math.hypot(dx, dy)
    if (l > 0) {
      const rl = round(l, o.grid)
      const p = { x: o.from.x + (dx / l) * rl, y: o.from.y + (dy / l) * rl }
      const onWall = snapToWall(p, walls, o.radius / 2)
      return onWall ?? { p, kind: 'angle' }
    }
  }

  // 3. A point on an existing wall centreline.
  const onWall = snapToWall(raw, walls, o.radius / 2)
  if (onWall) return { p: { x: round(onWall.p.x, 1), y: round(onWall.p.y, 1) }, kind: 'wall' }

  // 4. Grid.
  return { p: { x: round(raw.x, o.grid), y: round(raw.y, o.grid) }, kind: 'grid' }
}

function snapToWall(p: Pt, walls: Wall[], radius: number): SnapResult | null {
  let best: SnapResult | null = null
  let bestD = radius
  for (const w of walls) {
    const c = closestOnWall(p, w)
    if (c.d <= bestD) {
      bestD = c.d
      best = { p: c.point, kind: 'wall' }
    }
  }
  return best
}
