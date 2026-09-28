/**
 * Renderer-neutral drawing primitives in local coordinates (cm).
 * Both the SVG editor and the GeoJSON exporter consume these, so the
 * editor view and the TanStack output always draw the same symbol.
 */
export type Fill = 'none' | 'paper' | 'ink'
export type ArcClose = 'sector' | 'chord'

export interface Stroke {
  dash?: boolean
  /** Line weight multiplier (1 = hairline). */
  weight?: number
}

export type Primitive =
  | ({ t: 'line'; x1: number; y1: number; x2: number; y2: number } & Stroke)
  | ({ t: 'poly'; pts: [number, number][]; closed?: boolean; fill?: Fill } & Stroke)
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: Fill } & Stroke)
  | ({ t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: Fill } & Stroke)
  /**
   * Arc from angle a0 to a1 (degrees, y-down, sweeping in the direction of a1 - a0).
   * `close` turns it into a pie slice (`sector`) or a segment cut by its chord (`chord`).
   */
  | ({ t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; close?: ArcClose; fill?: Fill } & Stroke)
  /** Text height is expressed in hairline units so it stays legible at any scale. */
  | { t: 'text'; x: number; y: number; text: string; size?: number; /** Shrink to fit this width (cm). */ maxWidth?: number }

export const line = (x1: number, y1: number, x2: number, y2: number, s: Stroke = {}): Primitive => ({
  t: 'line',
  x1,
  y1,
  x2,
  y2,
  ...s,
})
export const rect = (x: number, y: number, w: number, h: number, o: Stroke & { r?: number; fill?: Fill } = {}): Primitive => ({
  t: 'rect',
  x,
  y,
  w,
  h,
  ...o,
})
export const circle = (cx: number, cy: number, r: number, o: Stroke & { fill?: Fill } = {}): Primitive => ({
  t: 'ellipse',
  cx,
  cy,
  rx: r,
  ry: r,
  ...o,
})
export const ellipse = (cx: number, cy: number, rx: number, ry: number, o: Stroke & { fill?: Fill } = {}): Primitive => ({
  t: 'ellipse',
  cx,
  cy,
  rx,
  ry,
  ...o,
})
export const poly = (pts: [number, number][], o: Stroke & { closed?: boolean; fill?: Fill } = {}): Primitive => ({
  t: 'poly',
  pts,
  ...o,
})
export const arc = (
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  s: Stroke & { close?: ArcClose; fill?: Fill } = {},
): Primitive => ({
  t: 'arc',
  cx,
  cy,
  r,
  a0,
  a1,
  ...s,
})
export const text = (x: number, y: number, value: string, size?: number, maxWidth?: number): Primitive => ({
  t: 'text',
  x,
  y,
  text: value,
  size,
  maxWidth,
})

/** Rounded rectangle as a closed polyline (used where a primitive needs explicit corners). */
export function roundedRectPts(x: number, y: number, w: number, h: number, r: number, seg = 4): [number, number][] {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (rr === 0)
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ]
  const out: [number, number][] = []
  const corners: [number, number, number][] = [
    [x + w - rr, y + rr, -90],
    [x + w - rr, y + h - rr, 0],
    [x + rr, y + h - rr, 90],
    [x + rr, y + rr, 180],
  ]
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180
      out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
    }
  }
  return out
}

/** Tessellates an arc into points. */
export function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, stepDeg = 6): [number, number][] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / stepDeg))
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

/** Outline of an arc primitive as points, closed back through the centre for sectors. */
export function arcOutline(p: Extract<Primitive, { t: 'arc' }>): [number, number][] {
  const pts = arcPoints(p.cx, p.cy, p.r, p.a0, p.a1)
  return p.close === 'sector' ? [...pts, [p.cx, p.cy]] : pts
}

/** SVG path data for an arc primitive. */
export function arcPath(p: Extract<Primitive, { t: 'arc' }>): string {
  const sweep = p.a1 - p.a0
  // A full circle cannot be one SVG arc command; split it in two.
  if (Math.abs(sweep) >= 359.999) {
    const m = (p.a0 + p.a1) / 2
    return `${arcPath({ ...p, a1: m, close: undefined })} ${arcPath({ ...p, a0: m, close: undefined }).replace(/^M[^A]*/, '')}${p.close ? 'Z' : ''}`
  }
  const r0 = (p.a0 * Math.PI) / 180
  const r1 = (p.a1 * Math.PI) / 180
  const x0 = p.cx + p.r * Math.cos(r0)
  const y0 = p.cy + p.r * Math.sin(r0)
  const x1 = p.cx + p.r * Math.cos(r1)
  const y1 = p.cy + p.r * Math.sin(r1)
  const large = Math.abs(sweep) > 180 ? 1 : 0
  const dir = sweep > 0 ? 1 : 0
  const body = `M${x0} ${y0}A${p.r} ${p.r} 0 ${large} ${dir} ${x1} ${y1}`
  if (p.close === 'sector') return `${body}L${p.cx} ${p.cy}Z`
  if (p.close === 'chord') return `${body}Z`
  return body
}
