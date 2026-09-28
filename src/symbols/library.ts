import type { Category, ComponentDef, OpeningKind } from '../model/types'
import { arc, arcPoints, circle, ellipse, line, poly, rect, text, type Primitive } from './primitives'

type SymbolFn = (w: number, d: number) => Primitive[]

const m = Math.min
const outline = (w: number, d: number, r = 0): Primitive => rect(0, 0, w, d, { fill: 'paper', r })

function bed(pillows: number): SymbolFn {
  return (w, d) => {
    const ph = m(35, d * 0.17)
    const gap = 6
    const pw = (w - 12 - gap * (pillows - 1)) / pillows
    const top = 8 + ph + 10
    const out: Primitive[] = [outline(w, d), line(0, 5, w, 5)]
    for (let i = 0; i < pillows; i++) out.push(rect(6 + i * (pw + gap), 9, pw, ph, { r: 6 }))
    out.push(line(0, top, w, top), line(0, top + 16, w, top + 16))
    out.push(poly([
      [w * 0.62, d],
      [w, d - w * 0.38],
    ]))
    return out
  }
}

function sofa(seats?: number): SymbolFn {
  return (w, d) => {
    const back = d * 0.24
    const arm = m(18, w * 0.14)
    const n = seats ?? Math.max(1, Math.round((w - 2 * arm) / 65))
    const sw = (w - 2 * arm) / n
    const out: Primitive[] = [outline(w, d, 4), rect(0, 0, w, back, { r: 4 }), rect(0, 0, arm, d, { r: 4 }), rect(w - arm, 0, arm, d, { r: 4 })]
    for (let i = 0; i < n; i++) out.push(rect(arm + i * sw + 1, back + 1, sw - 2, d - back - 4, { r: 3 }))
    return out
  }
}

const symbols: Record<string, SymbolFn> = {
  'bed-double': bed(2),
  'bed-single': bed(1),
  'bed-king': bed(2),
  nightstand: (w, d) => {
    const r = m(w, d) * 0.22
    return [outline(w, d), rect(4, 4, w - 8, d - 8), circle(w / 2, d / 2, r), line(w / 2 - r, d / 2, w / 2 + r, d / 2), line(w / 2, d / 2 - r, w / 2, d / 2 + r)]
  },
  wardrobe: (w, d) => {
    const out: Primitive[] = [outline(w, d), line(4, d / 2, w - 4, d / 2), line(0, d - 3, w, d - 3)]
    for (let x = 14; x < w - 8; x += 11) out.push(line(x - 4, d / 2 - d * 0.28, x + 4, d / 2 + d * 0.28))
    return out
  },
  dresser: (w, d) => [outline(w, d), rect(3, 3, w - 6, d - 8), line(0, d - 3, w, d - 3)],
  'sofa-3': sofa(3),
  'sofa-2': sofa(2),
  armchair: sofa(1),
  'coffee-table': (w, d) => [outline(w, d, 2), rect(5, 5, w - 10, d - 10, { r: 1 })],
  'side-table': (w, d) => [ellipse(w / 2, d / 2, w / 2, d / 2, { fill: 'paper' }), ellipse(w / 2, d / 2, w / 2 - 5, d / 2 - 5)],
  'tv-unit': (w, d) => [outline(w, d), rect(w * 0.15, 4, w * 0.7, 4, { fill: 'ink' }), line(w / 3, 10, w / 3, d), line((2 * w) / 3, 10, (2 * w) / 3, d)],
  rug: (w, d) => [rect(0, 0, w, d, { dash: true }), rect(8, 8, w - 16, d - 16, { dash: true })],
  plant: (w, d) => {
    const cx = w / 2
    const cy = d / 2
    const r = m(w, d) / 2
    const out: Primitive[] = [ellipse(cx, cy, w / 2, d / 2, { fill: 'paper' }), circle(cx, cy, r * 0.3)]
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + (i % 2) * 0.2
      out.push(line(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3, cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85))
    }
    return out
  },
  'dining-table': (w, d) => [outline(w, d, 2)],
  'round-table': (w, d) => [ellipse(w / 2, d / 2, w / 2, d / 2, { fill: 'paper' })],
  chair: (w, d) => [
    rect(2, d * 0.2, w - 4, d * 0.8 - 1, { r: 4, fill: 'paper' }),
    rect(0, 0, w, d * 0.2, { r: 3, fill: 'paper' }),
  ],
  desk: (w, d) => [outline(w, d), rect(w * 0.3, 6, w * 0.4, 3, { fill: 'ink' }), rect(w * 0.36, d * 0.45, w * 0.28, m(14, d * 0.2), { r: 1 })],
  'office-chair': (w, d) => [
    ellipse(w / 2, d / 2, w / 2, d / 2, { dash: true }),
    rect(w * 0.17, d * 0.28, w * 0.66, d * 0.58, { r: 8, fill: 'paper' }),
    rect(w * 0.14, d * 0.1, w * 0.72, d * 0.16, { r: 5, fill: 'paper' }),
  ],
  bookshelf: (w, d) => {
    const out: Primitive[] = [outline(w, d), line(0, d - 3, w, d - 3)]
    const n = Math.max(1, Math.round(w / 40))
    for (let i = 1; i < n; i++) out.push(line((w * i) / n, 0, (w * i) / n, d - 3))
    return out
  },
  'storage-cabinet': (w, d) => [outline(w, d), line(0, 0, w, d), line(0, d - 3, w, d - 3)],
  'base-cabinet': (w, d) => [outline(w, d), line(0, d - 4, w, d - 4)],
  'wall-cabinet': (w, d) => [rect(0, 0, w, d, { dash: true }), line(0, 0, w, d, { dash: true }), line(w, 0, 0, d, { dash: true })],
  sink: (w, d) => {
    const bw = m(w - 16, 50)
    return [
      outline(w, d),
      rect((w - bw) / 2, 12, bw, d - 20, { r: 6 }),
      circle(w / 2, 12 + (d - 20) / 2, 2.5),
      circle(w / 2, 6, 2),
    ]
  },
  'double-sink': (w, d) => {
    const bw = (w - 24) / 2
    return [
      outline(w, d),
      rect(8, 12, bw, d - 20, { r: 6 }),
      rect(16 + bw, 12, bw, d - 20, { r: 6 }),
      circle(8 + bw / 2, 12 + (d - 20) / 2, 2.5),
      circle(16 + bw * 1.5, 12 + (d - 20) / 2, 2.5),
      circle(w / 2, 6, 2),
    ]
  },
  cooktop: (w, d) => {
    const s = m(w, d)
    const burners: [number, number, number][] = [
      [w * 0.28, d * 0.3, s * 0.15],
      [w * 0.72, d * 0.3, s * 0.11],
      [w * 0.28, d * 0.72, s * 0.11],
      [w * 0.72, d * 0.72, s * 0.15],
    ]
    return [outline(w, d), ...burners.flatMap(([x, y, r]) => [circle(x, y, r), circle(x, y, r * 0.45)])]
  },
  oven: (w, d) => [outline(w, d), rect(5, 5, w - 10, d - 14), line(w * 0.2, d - 4, w * 0.8, d - 4, { weight: 2 })],
  fridge: (w, d) => [outline(w, d), line(0, d - 5, w, d - 5), text(w / 2, d / 2, 'REF')],
  dishwasher: (w, d) => [outline(w, d), line(0, d - 4, w, d - 4), text(w / 2, d / 2, 'DW')],
  'washing-machine': (w, d) => {
    const r = m(w, d) * 0.32
    return [outline(w, d), circle(w / 2, d / 2, r), circle(w / 2, d / 2, r * 0.7)]
  },
  toilet: (w, d) => {
    const tank = d * 0.26
    const by = tank + (d - tank) / 2 - 1
    return [
      rect(w * 0.04, 0, w * 0.92, tank, { r: 3, fill: 'paper' }),
      ellipse(w / 2, by, w * 0.42, (d - tank) / 2 - 1, { fill: 'paper' }),
      ellipse(w / 2, by + 2, w * 0.28, (d - tank) / 2 - 8),
    ]
  },
  washbasin: (w, d) => [
    outline(w, d, 4),
    ellipse(w / 2, d * 0.56, w * 0.36, d * 0.3),
    circle(w / 2, d * 0.56, 2),
    circle(w / 2, d * 0.14, 2),
  ],
  bathtub: (w, d) => [outline(w, d), rect(8, 8, w - 16, d - 16, { r: m(20, d / 3) }), circle(22, d / 2, 3)],
  shower: (w, d) => [outline(w, d), line(0, 0, w, d), line(w, 0, 0, d), circle(w / 2, d / 2, 4, { fill: 'paper' })],

  /* ---------- Added set ---------- */
  'sofa-l': (w, d) => {
    const leg = m(95, w * 0.42)
    const depth = m(95, d * 0.55)
    const back = m(22, depth * 0.25)
    const arm = m(18, leg * 0.2)
    const shape: [number, number][] = [
      [0, 0],
      [w, 0],
      [w, depth],
      [leg, depth],
      [leg, d],
      [0, d],
    ]
    const seats = Math.max(1, Math.round((w - leg - arm) / 70))
    const sw = (w - leg - arm) / seats
    const out: Primitive[] = [
      poly(shape, { closed: true, fill: 'paper' }),
      rect(0, 0, w, back, { r: 3 }),
      rect(0, 0, back, d, { r: 3 }),
      rect(w - arm, 0, arm, depth, { r: 3 }),
      rect(0, d - arm, leg, arm, { r: 3 }),
      rect(back + 1, back + 1, leg - back - 2, depth - back - 2, { r: 3 }),
    ]
    for (let i = 0; i < seats; i++) out.push(rect(leg + i * sw + 1, back + 1, sw - 2, depth - back - 3, { r: 3 }))
    out.push(rect(back + 1, depth + 1, leg - back - 3, d - depth - arm - 2, { r: 3 }))
    return out
  },
  ottoman: (w, d) => [outline(w, d, 6), rect(5, 5, w - 10, d - 10, { r: 4 })],
  bench: (w, d) => [outline(w, d, 2), line(4, d / 2, w - 4, d / 2, { dash: true })],
  fireplace: (w, d) => {
    const fw = w * 0.55
    return [
      outline(w, d),
      poly(
        [
          [(w - fw) / 2, d],
          [(w - fw * 0.7) / 2, d * 0.3],
          [(w + fw * 0.7) / 2, d * 0.3],
          [(w + fw) / 2, d],
        ],
        { fill: 'ink' },
      ),
    ]
  },
  'piano-grand': (w, d) => {
    const kb = m(16, d * 0.1)
    const r = m(w * 0.18, d * 0.1)
    const tailY = d - r
    // Straight bass side on the left, a rounded tail, and the bentside curving in on the right.
    const bent: [number, number][] = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      const e = t * t * (3 - 2 * t)
      bent.push([w - (w - 2 * r) * e, d * 0.35 + (tailY - d * 0.35) * t])
    }
    // 0° → 180° runs along the bottom in y-down space.
    const tail = arcPoints(r, tailY, r, 0, 180, 15).slice(1)
    const shape: [number, number][] = [[0, kb], [w, kb], ...bent, ...tail]
    return [
      poly(shape, { closed: true, fill: 'paper' }),
      rect(0, 0, w, kb, { fill: 'paper' }),
      line(w * 0.12, kb + 8, w * 0.7, d * 0.78),
    ]
  },
  'piano-upright': (w, d) => {
    const kb = d * 0.45
    const out: Primitive[] = [outline(w, d), rect(4, d - kb, w - 8, kb - 3)]
    for (let x = 4 + (w - 8) / 14; x < w - 5; x += (w - 8) / 14) out.push(line(x, d - kb, x, d - 3))
    return out
  },
  'floor-lamp': (w, d) => {
    const r = m(w, d) / 2
    return [ellipse(w / 2, d / 2, w / 2, d / 2, { fill: 'paper' }), circle(w / 2, d / 2, r * 0.35), line(w / 2 - r, d / 2, w / 2 + r, d / 2), line(w / 2, d / 2 - r, w / 2, d / 2 + r)]
  },
  'bunk-bed': (w, d) => [outline(w, d), rect(5, 5, w - 10, d - 10, { dash: true }), line(0, 5, w, 5), rect(8, 9, w - 16, m(30, d * 0.15), { r: 6 }), line(w - 6, d * 0.35, w - 6, d * 0.65, { weight: 2 })],
  crib: (w, d) => {
    const out: Primitive[] = [outline(w, d), rect(5, 5, w - 10, d - 10)]
    for (let x = 12; x < w - 8; x += 8) out.push(line(x, 0, x, 5), line(x, d - 5, x, d))
    return out
  },
  'dressing-table': (w, d) => [outline(w, d), line(0, 4, w, 4), ellipse(w / 2, 10, w * 0.25, 4), rect(w * 0.35, d * 0.55, w * 0.3, d * 0.3, { r: 1 })],
  'kitchen-island': (w, d) => [outline(w, d), rect(0, 0, w, d * 0.66), line(w * 0.1, d * 0.8, w * 0.9, d * 0.8, { dash: true })],
  'corner-cabinet': (w, d) => {
    const a = m(60, w * 0.66, d * 0.66)
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
      line(a, a, 0, 0),
      line(w - 4, 0, w - 4, a),
      line(0, d - 4, a, d - 4),
    ]
  },
  'bar-stool': (w, d) => [ellipse(w / 2, d / 2, w / 2, d / 2, { fill: 'paper' }), ellipse(w / 2, d / 2, w * 0.32, d * 0.32)],
  microwave: (w, d) => [outline(w, d), rect(4, 4, w * 0.62, d - 8), text(w * 0.82, d / 2, 'MW', 0.8)],
  pantry: (w, d) => [outline(w, d), line(0, d - 4, w, d - 4), line(0, 0, w, d - 4), line(w, 0, 0, d - 4)],
  range: (w, d) => {
    const s = m(w, d)
    const burners: [number, number, number][] = [
      [w * 0.28, d * 0.28, s * 0.13],
      [w * 0.72, d * 0.28, s * 0.1],
      [w * 0.28, d * 0.66, s * 0.1],
      [w * 0.72, d * 0.66, s * 0.13],
    ]
    return [outline(w, d), ...burners.flatMap(([x, y, r]) => [circle(x, y, r), circle(x, y, r * 0.45)]), line(0, d - 6, w, d - 6), line(w * 0.2, d - 3, w * 0.8, d - 3, { weight: 2 })]
  },
  'range-hood': (w, d) => [
    rect(0, 0, w, d, { dash: true }),
    poly(
      [
        [w * 0.3, 0],
        [w * 0.7, 0],
        [w, d],
        [0, d],
      ],
      { closed: true, dash: true },
    ),
  ],
  'dining-6': (w, d) => {
    const cd = m(45, d * 0.25)
    const tw = w - 16
    const td = d - 2 * cd + 12
    const ty = cd - 6
    const cw = m(45, tw / 3 - 8)
    const out: Primitive[] = []
    for (let i = 0; i < 3; i++) {
      const cx = 8 + (tw * (i + 0.5)) / 3 - cw / 2
      out.push(rect(cx, 0, cw, cd, { r: 4, fill: 'paper' }), rect(cx, d - cd, cw, cd, { r: 4, fill: 'paper' }))
    }
    out.push(rect(8, ty, tw, td, { r: 2, fill: 'paper' }))
    return out
  },
  'corner-shower': (w, d) => {
    const curve = arcPoints(0, 0, 1, 0, 90, 6).map(([x, y]): [number, number] => [x * w, y * d])
    const inner = arcPoints(0, 0, 1, 0, 90, 6).map(([x, y]): [number, number] => [x * (w - 8), y * (d - 8)])
    return [poly([[0, 0], ...curve], { closed: true, fill: 'paper' }), poly([[0, 0], ...inner], { closed: true }), circle(w * 0.3, d * 0.3, 3)]
  },
  bidet: (w, d) => [ellipse(w / 2, d / 2 + 2, w / 2 - 1, d / 2 - 3, { fill: 'paper' }), ellipse(w / 2, d / 2 + 4, w * 0.3, d * 0.3), circle(w / 2, 8, 2)],
  'double-vanity': (w, d) => {
    const bw = m(50, w * 0.32)
    return [
      outline(w, d, 3),
      ellipse(w * 0.27, d * 0.56, bw / 2, d * 0.28),
      ellipse(w * 0.73, d * 0.56, bw / 2, d * 0.28),
      circle(w * 0.27, d * 0.14, 2),
      circle(w * 0.73, d * 0.14, 2),
    ]
  },
  dryer: (w, d) => {
    const r = m(w, d) * 0.32
    return [outline(w, d), circle(w / 2, d / 2, r), text(w / 2, d / 2, 'D', 0.9)]
  },
  'water-heater': (w, d) => [ellipse(w / 2, d / 2, w / 2, d / 2, { fill: 'paper' }), text(w / 2, d / 2, 'WH', 0.9)],
  'desk-l': (w, d) => {
    const a = m(70, w * 0.5, d * 0.5)
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
      rect(w * 0.45, 6, w * 0.3, 3, { fill: 'ink' }),
    ]
  },
  'filing-cabinet': (w, d) => [outline(w, d), line(0, d - 4, w, d - 4), rect(w * 0.35, d - 3.2, w * 0.3, 2, { fill: 'ink' })],
  'conference-table': (w, d) => [outline(w, d, m(w, d) / 2), rect(10, 10, w - 20, d - 20, { r: (m(w, d) - 20) / 2, dash: true })],
  stairs: (w, d) => {
    const run = 28
    const n = Math.max(2, Math.floor(d / run))
    const step = d / n
    const out: Primitive[] = [outline(w, d)]
    for (let i = 1; i < n; i++) out.push(line(0, d - i * step, w, d - i * step))
    out.push(line(w / 2, d - step / 2, w / 2, step / 2), line(w / 2, step / 2, w / 2 - 6, step / 2 + 9), line(w / 2, step / 2, w / 2 + 6, step / 2 + 9))
    out.push(text(w / 2, d - step / 2 + 1, 'UP', 0.8))
    return out
  },
  'stairs-spiral': (w, d) => {
    const cx = w / 2
    const cy = d / 2
    const out: Primitive[] = [ellipse(cx, cy, w / 2, d / 2, { fill: 'paper' })]
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12
      out.push(line(cx + Math.cos(a) * w * 0.08, cy + Math.sin(a) * d * 0.08, cx + Math.cos(a) * w * 0.5, cy + Math.sin(a) * d * 0.5))
    }
    out.push(ellipse(cx, cy, w * 0.08, d * 0.08, { fill: 'ink' }))
    out.push(poly(arcPoints(0, 0, 1, -90, 180, 6).map(([x, y]): [number, number] => [cx + x * w * 0.32, cy + y * d * 0.32])))
    return out
  },
  'column-round': (w, d) => [ellipse(w / 2, d / 2, w / 2, d / 2, { fill: 'ink' })],
  'column-square': (w, d) => [rect(0, 0, w, d, { fill: 'ink' })],
  radiator: (w, d) => {
    const out: Primitive[] = [outline(w, d)]
    for (let x = 6; x < w - 3; x += 6) out.push(line(x, 0, x, d))
    return out
  },
  elevator: (w, d) => [outline(w, d), rect(6, 6, w - 12, d - 16), line(6, 6, w - 6, d - 10), line(w - 6, 6, 6, d - 10), line(w * 0.3, d - 3, w * 0.7, d - 3, { weight: 2 })],
  car: (w, d) => {
    const ww = w * 0.12
    const wl = d * 0.12
    return [
      rect(-2, d * 0.18, ww, wl, { r: 3, fill: 'ink' }),
      rect(w - ww + 2, d * 0.18, ww, wl, { r: 3, fill: 'ink' }),
      rect(-2, d * 0.7, ww, wl, { r: 3, fill: 'ink' }),
      rect(w - ww + 2, d * 0.7, ww, wl, { r: 3, fill: 'ink' }),
      rect(0, 0, w, d, { r: m(w * 0.3, 40), fill: 'paper' }),
      rect(w * 0.12, d * 0.3, w * 0.76, d * 0.42, { r: 10 }),
      line(w * 0.12, d * 0.36, w * 0.88, d * 0.36),
      line(w * 0.12, d * 0.64, w * 0.88, d * 0.64),
    ]
  },
  tree: (w, d) => {
    const cx = w / 2
    const cy = d / 2
    const out: Primitive[] = []
    const n = 14
    // Scalloped canopy: a ring of small arcs.
    for (let i = 0; i < n; i++) {
      const a0 = (i * 360) / n
      const a1 = ((i + 1) * 360) / n
      const pts = arcPoints(0, 0, 1, a0, a1, 3).map(([x, y], k, all): [number, number] => {
        const bump = 1 + 0.07 * Math.sin((k / (all.length - 1)) * Math.PI)
        return [cx + x * w * 0.44 * bump, cy + y * d * 0.44 * bump]
      })
      out.push(poly(pts))
    }
    out.push(ellipse(cx, cy, w * 0.04, d * 0.04, { fill: 'ink' }))
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + 0.3
      out.push(line(cx, cy, cx + Math.cos(a) * w * 0.25, cy + Math.sin(a) * d * 0.25))
    }
    return out
  },
  'patio-set': (w, d) => {
    const r = m(w, d) * 0.2
    const out: Primitive[] = []
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2
      const x = w / 2 + Math.cos(a) * (w / 2 - r * 0.9)
      const y = d / 2 + Math.sin(a) * (d / 2 - r * 0.9)
      out.push(circle(x, y, r * 0.85, { fill: 'paper' }))
    }
    out.push(ellipse(w / 2, d / 2, w * 0.28, d * 0.28, { fill: 'paper' }))
    return out
  },
  'sun-lounger': (w, d) => [outline(w, d, 4), line(0, d * 0.3, w, d * 0.3), rect(4, 4, w - 8, d * 0.3 - 8, { r: 3 })],
  'hot-tub': (w, d) => [outline(w, d, m(w, d) * 0.12), ellipse(w / 2, d / 2, w * 0.38, d * 0.38), circle(w / 2, d / 2, 4)],
}

/** Door and window symbols, drawn in the opening's frame: u along the wall, v across it. */
export function openingSymbol(
  kind: OpeningKind,
  width: number,
  thickness: number,
  flipSide: boolean,
  flipHinge: boolean,
): Primitive[] {
  const hw = width / 2
  const ht = thickness / 2
  const vs = flipSide ? -1 : 1
  const hs = flipHinge ? -1 : 1
  const jambs = [line(-hw, -ht, -hw, ht), line(hw, -ht, hw, ht)]
  switch (kind) {
    case 'door': {
      const hx = -hw * hs
      const face = ht * vs
      const leafAngle = vs > 0 ? 90 : -90
      const closedAngle = hs > 0 ? 0 : 180
      return [
        ...jambs,
        rect(Math.min(hx, hx + 4 * hs), Math.min(face, face + width * vs), 4, width, { weight: 1.5, fill: 'paper' }),
        arc(hx, face, width, leafAngle, sweepTo(leafAngle, closedAngle)),
      ]
    }
    case 'double-door': {
      const face = ht * vs
      const leafAngle = vs > 0 ? 90 : -90
      const leaf = hw
      return [
        ...jambs,
        rect(-hw, Math.min(face, face + leaf * vs), 4, leaf, { weight: 1.5, fill: 'paper' }),
        rect(hw - 4, Math.min(face, face + leaf * vs), 4, leaf, { weight: 1.5, fill: 'paper' }),
        arc(-hw, face, leaf, leafAngle, sweepTo(leafAngle, 0)),
        arc(hw, face, leaf, leafAngle, sweepTo(leafAngle, 180)),
      ]
    }
    case 'sliding-door': {
      const pw = width / 2 + 5
      return [
        ...jambs,
        rect(-hw, -3, pw, 3, { fill: 'paper' }),
        rect(hw - pw, 0, pw, 3, { fill: 'paper' }),
        line(-hw * 0.3, 7 * vs, hw * 0.3, 7 * vs),
        line(hw * 0.3, 7 * vs, hw * 0.3 - 4, 7 * vs - 3),
        line(hw * 0.3, 7 * vs, hw * 0.3 - 4, 7 * vs + 3),
      ]
    }
    case 'pocket-door':
      // The leaf slides into a pocket inside the wall, beside the hinge jamb.
      return [
        ...jambs,
        rect(Math.min(-hw * hs, -hw * hs - width * 0.85 * hs), -1.5, width * 0.85, 3, { dash: true, fill: 'paper' }),
        rect(Math.min(-hw * hs, -hw * hs + width * 0.25 * hs), -1.5, width * 0.25, 3, { weight: 1.5, fill: 'paper' }),
      ]
    case 'bifold-door': {
      const face = ht * vs
      const fold = width * 0.22 * vs
      const q = width / 4
      return [
        ...jambs,
        poly([
          [-hw, face],
          [-hw + q, face + fold],
          [0, face],
        ], { weight: 1.5 }),
        poly([
          [0, face],
          [hw - q, face + fold],
          [hw, face],
        ], { weight: 1.5 }),
      ]
    }
    case 'passage':
      return [...jambs, line(-hw, -ht, hw, -ht, { dash: true }), line(-hw, ht, hw, ht, { dash: true })]
    case 'window':
      return [rect(-hw, -ht, width, thickness, { fill: 'paper' }), line(-hw, -1.5, hw, -1.5), line(-hw, 1.5, hw, 1.5)]
  }
}

/** Picks the end angle so an arc from `from` sweeps the short 90° toward `to`. */
function sweepTo(from: number, to: number): number {
  let d = to - from
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return from + d
}

export function builtinSymbol(key: string, w: number, d: number): Primitive[] {
  const fn = symbols[key]
  return fn ? fn(w, d) : [outline(w, d), line(0, 0, w, d), line(w, 0, 0, d)]
}

export const BUILTIN_SYMBOL_KEYS = Object.keys(symbols)

const def = (key: string, name: string, category: Category, width: number, depth: number, height?: number): ComponentDef => ({
  id: `builtin:${key}`,
  name,
  category,
  width,
  depth,
  height,
  symbol: { kind: 'builtin', key },
  builtin: true,
})

export const BUILTIN_COMPONENTS: ComponentDef[] = [
  def('sofa-3', 'Sofa (3 seat)', 'Living', 220, 95, 85),
  def('sofa-2', 'Sofa (2 seat)', 'Living', 160, 90, 85),
  def('armchair', 'Armchair', 'Living', 85, 85, 85),
  def('coffee-table', 'Coffee table', 'Living', 110, 60, 45),
  def('side-table', 'Side table', 'Living', 50, 50, 55),
  def('tv-unit', 'TV unit', 'Living', 180, 45, 50),
  def('rug', 'Rug', 'Living', 200, 140),
  def('plant', 'Plant', 'Living', 50, 50, 120),
  def('bed-double', 'Double bed', 'Bedroom', 160, 200, 50),
  def('bed-single', 'Single bed', 'Bedroom', 90, 200, 50),
  def('nightstand', 'Nightstand', 'Bedroom', 45, 40, 55),
  def('wardrobe', 'Wardrobe', 'Bedroom', 120, 60, 210),
  def('dresser', 'Dresser', 'Bedroom', 100, 50, 80),
  def('base-cabinet', 'Base cabinet', 'Kitchen', 60, 60, 90),
  def('wall-cabinet', 'Wall cabinet', 'Kitchen', 60, 35, 70),
  def('sink', 'Sink', 'Kitchen', 80, 60, 90),
  def('double-sink', 'Double sink', 'Kitchen', 120, 60, 90),
  def('cooktop', 'Cooktop', 'Kitchen', 60, 60, 90),
  def('oven', 'Oven', 'Kitchen', 60, 60, 90),
  def('fridge', 'Fridge', 'Kitchen', 70, 70, 190),
  def('dishwasher', 'Dishwasher', 'Kitchen', 60, 60, 85),
  def('dining-table', 'Dining table', 'Kitchen', 160, 90, 75),
  def('round-table', 'Round table', 'Kitchen', 100, 100, 75),
  def('chair', 'Chair', 'Kitchen', 45, 50, 90),
  def('toilet', 'Toilet', 'Bathroom', 40, 70, 80),
  def('washbasin', 'Washbasin', 'Bathroom', 60, 45, 85),
  def('bathtub', 'Bathtub', 'Bathroom', 170, 75, 55),
  def('shower', 'Shower', 'Bathroom', 90, 90),
  def('washing-machine', 'Washing machine', 'Bathroom', 60, 60, 85),
  def('desk', 'Desk', 'Office', 140, 70, 75),
  def('office-chair', 'Office chair', 'Office', 60, 60, 110),
  def('bookshelf', 'Bookshelf', 'Office', 90, 35, 200),
  def('storage-cabinet', 'Storage cabinet', 'Storage', 80, 45, 200),
  // Added set
  def('sofa-l', 'Corner sofa', 'Living', 260, 190, 85),
  def('ottoman', 'Ottoman', 'Living', 60, 60, 42),
  def('bench', 'Bench', 'Living', 120, 40, 45),
  def('fireplace', 'Fireplace', 'Living', 150, 40, 110),
  def('piano-grand', 'Grand piano', 'Living', 150, 180, 100),
  def('piano-upright', 'Upright piano', 'Living', 150, 60, 125),
  def('floor-lamp', 'Floor lamp', 'Living', 40, 40, 170),
  def('bed-king', 'King bed', 'Bedroom', 180, 200, 50),
  def('bunk-bed', 'Bunk bed', 'Bedroom', 90, 200, 160),
  def('crib', 'Crib', 'Bedroom', 70, 130, 90),
  def('dressing-table', 'Dressing table', 'Bedroom', 100, 45, 75),
  def('kitchen-island', 'Kitchen island', 'Kitchen', 180, 90, 90),
  def('corner-cabinet', 'Corner cabinet', 'Kitchen', 90, 90, 90),
  def('range', 'Range', 'Kitchen', 76, 65, 90),
  def('range-hood', 'Range hood', 'Kitchen', 90, 50, 60),
  def('microwave', 'Microwave', 'Kitchen', 50, 40, 30),
  def('pantry', 'Pantry', 'Kitchen', 60, 60, 210),
  def('dining-6', 'Dining set (6)', 'Kitchen', 210, 190, 75),
  def('bar-stool', 'Bar stool', 'Kitchen', 40, 40, 75),
  def('corner-shower', 'Corner shower', 'Bathroom', 90, 90),
  def('bidet', 'Bidet', 'Bathroom', 40, 60, 40),
  def('double-vanity', 'Double vanity', 'Bathroom', 140, 55, 85),
  def('dryer', 'Dryer', 'Bathroom', 60, 60, 85),
  def('desk-l', 'Corner desk', 'Office', 160, 140, 75),
  def('filing-cabinet', 'Filing cabinet', 'Office', 45, 60, 100),
  def('conference-table', 'Meeting table', 'Office', 240, 110, 75),
  def('stairs', 'Straight stairs', 'Structure', 100, 300),
  def('stairs-spiral', 'Spiral stairs', 'Structure', 160, 160),
  def('column-round', 'Round column', 'Structure', 30, 30),
  def('column-square', 'Square column', 'Structure', 30, 30),
  def('radiator', 'Radiator', 'Structure', 100, 12, 60),
  def('water-heater', 'Water heater', 'Structure', 55, 55, 150),
  def('elevator', 'Elevator', 'Structure', 150, 160),
  def('car', 'Car', 'Outdoor', 180, 450, 150),
  def('tree', 'Tree', 'Outdoor', 300, 300),
  def('patio-set', 'Patio set', 'Outdoor', 200, 200, 75),
  def('sun-lounger', 'Sun lounger', 'Outdoor', 70, 195, 35),
  def('hot-tub', 'Hot tub', 'Outdoor', 210, 210, 90),
]
