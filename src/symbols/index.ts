import type { ComponentDef, PresetShape } from '../model/types'
import { builtinSymbol } from './library'
import { arcOutline, ellipse, poly, rect, text, type Primitive } from './primitives'

export const PRESET_SHAPES: { value: PresetShape; label: string }[] = [
  { value: 'rect', label: 'Rect' },
  { value: 'rounded', label: 'Round' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'lshape', label: 'L-shape' },
]

export const defaultArm = (w: number, d: number) => Math.round(Math.min(w, d) * 0.45)

function presetSymbol(def: ComponentDef, shape: PresetShape, w: number, d: number, arm?: number): Primitive[] {
  const label = def.name.toUpperCase()
  switch (shape) {
    case 'rect':
      return [rect(0, 0, w, d, { fill: 'paper' }), text(w / 2, d / 2, label, 1, w)]
    case 'rounded':
      return [rect(0, 0, w, d, { fill: 'paper', r: Math.min(w, d) * 0.15 }), text(w / 2, d / 2, label, 1, w)]
    case 'ellipse':
      return [ellipse(w / 2, d / 2, w / 2, d / 2, { fill: 'paper' }), text(w / 2, d / 2, label, 1, w)]
    case 'lshape': {
      const a = Math.max(5, Math.min(arm ?? defaultArm(w, d), w - 5, d - 5))
      return [
        poly(
          [
            [0, 0],
            [w, 0],
            [w, a],
            [a, a],
            [a, d],
            [0, d],
          ],
          { closed: true, fill: 'paper' },
        ),
        text((w + a) / 2, a / 2, label, 1, w - a),
      ]
    }
  }
}

/** Stretches primitives by (sx, sy). Arcs stretched unevenly become polylines. */
export function scalePrims(prims: Primitive[], sx: number, sy: number): Primitive[] {
  if (sx === 1 && sy === 1) return prims
  const k = Math.min(sx, sy)
  return prims.map((p): Primitive => {
    switch (p.t) {
      case 'line':
        return { ...p, x1: p.x1 * sx, y1: p.y1 * sy, x2: p.x2 * sx, y2: p.y2 * sy }
      case 'poly':
        return { ...p, pts: p.pts.map(([x, y]) => [x * sx, y * sy]) }
      case 'rect':
        return { ...p, x: p.x * sx, y: p.y * sy, w: p.w * sx, h: p.h * sy, r: p.r === undefined ? undefined : p.r * k }
      case 'ellipse':
        return { ...p, cx: p.cx * sx, cy: p.cy * sy, rx: p.rx * sx, ry: p.ry * sy }
      case 'arc':
        if (Math.abs(sx - sy) < 1e-6) return { ...p, cx: p.cx * sx, cy: p.cy * sy, r: p.r * sx }
        return {
          t: 'poly',
          pts: arcOutline(p).map(([x, y]) => [x * sx, y * sy]),
          closed: !!p.close,
          fill: p.close ? p.fill : undefined,
          dash: p.dash,
          weight: p.weight,
        }
      case 'text':
        return { ...p, x: p.x * sx, y: p.y * sy, maxWidth: p.maxWidth === undefined ? undefined : p.maxWidth * sx }
    }
  })
}

/** Primitives for a component at the given size, in local coordinates (0..w, 0..d). */
export function symbolFor(def: ComponentDef, w = def.width, d = def.depth): Primitive[] {
  switch (def.symbol.kind) {
    case 'builtin':
      return builtinSymbol(def.symbol.key, w, d)
    case 'drawn':
      return scalePrims(def.symbol.shapes, w / (def.width || 1), d / (def.depth || 1))
    case 'preset':
      return presetSymbol(def, def.symbol.shape, w, d, def.symbol.arm)
  }
}
