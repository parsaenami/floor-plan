import type { Plan } from '../model/types'
import { activeFloor } from '../model/floors'
import type { Room } from '../geometry/rooms'
import type { BBox } from '../geometry/vec'
import { PlanLayers } from '../render/PlanLayers'
import { planBBox, type DefMap } from '../render/planGeometry'
import { MONO, PrintMode } from '../render/Primitives'
import { PlanColorsContext, THEMES, type ThemeId } from '../theme/themes'

export type Paper = 'A4' | 'A3'
export type Orientation = 'landscape' | 'portrait'

const PAPER_MM: Record<Paper, [number, number]> = { A4: [297, 210], A3: [420, 297] }
export const SCALES = [20, 50, 100, 200]

const MARGIN = 10
const TITLE_H = 20

export interface SheetOptions {
  paper: Paper
  orientation: Orientation
  scale: number
  title: string
  showDims: boolean
  /** Colour scheme of the sheet; paper prints black on white. */
  theme: ThemeId
}

export function sheetSize(o: Pick<SheetOptions, 'paper' | 'orientation'>): { w: number; h: number } {
  const [a, b] = PAPER_MM[o.paper]
  return o.orientation === 'landscape' ? { w: a, h: b } : { w: b, h: a }
}

function drawingArea(o: SheetOptions) {
  const { w, h } = sheetSize(o)
  return { x: MARGIN + 6, y: MARGIN + 6, w: w - 2 * MARGIN - 12, h: h - 2 * MARGIN - TITLE_H - 12 }
}

/** Plan extent in cm, padded to leave room for dimension text. */
export function planExtent(plan: Plan, defs: DefMap): BBox {
  const bb = planBBox(plan, defs) ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  const pad = 30
  return { minX: bb.minX - pad, minY: bb.minY - pad, maxX: bb.maxX + pad, maxY: bb.maxY + pad }
}

export function fitsAt(plan: Plan, defs: DefMap, o: SheetOptions): boolean {
  const bb = planExtent(plan, defs)
  const area = drawingArea(o)
  const k = 10 / o.scale
  return (bb.maxX - bb.minX) * k <= area.w && (bb.maxY - bb.minY) * k <= area.h
}

/** Largest standard scale that fits the drawing on the sheet. */
export function bestScale(plan: Plan, defs: DefMap, o: Omit<SheetOptions, 'scale'>): number {
  return SCALES.find((s) => fitsAt(plan, defs, { ...o, scale: s })) ?? SCALES[SCALES.length - 1]
}

/** A print sheet in millimetres: frame, the plan at scale, north arrow, scale bar and title block. */
export function Sheet({ plan, defs, rooms, options }: { plan: Plan; defs: DefMap; rooms: Room[]; options: SheetOptions }) {
  const { w, h } = sheetSize(options)
  const area = drawingArea(options)
  const bb = planExtent(plan, defs)
  const k = 10 / options.scale // mm per cm
  const ox = area.x + (area.w - (bb.maxX - bb.minX) * k) / 2
  const oy = area.y + (area.h - (bb.maxY - bb.minY) * k) / 2
  const unit = (0.2 * options.scale) / 10 // 0.2 mm hairline, in cm
  const total = rooms.reduce((s, r) => s + r.area, 0)
  const date = new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  const colors = THEMES[options.theme].plan
  const INK = colors.ink
  const PAPER = colors.paper

  // Scale bar: whole metres, at most ~70 mm long.
  const mPerMm = options.scale / 1000
  const barMetres = [10, 5, 4, 2, 1].find((m) => m / mPerMm <= 72) ?? 1
  const segs = barMetres <= 5 ? barMetres : barMetres / 2
  const segMm = barMetres / mPerMm / segs
  const barX = area.x
  const barY = area.y + area.h - 4

  const tbY = h - MARGIN - TITLE_H
  const cells: [string, string, number][] = [
    ['PROJECT', options.title, 0.4],
    ['DRAWING', (activeFloor(plan)?.name ?? 'Floor plan').toUpperCase(), 0.18],
    ['SCALE', `1:${options.scale}`, 0.12],
    ['AREA', `${total.toFixed(2)} m²`, 0.14],
    ['DATE', date, 0.16],
  ]
  const frameW = w - 2 * MARGIN
  let cx = MARGIN

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${w}mm`} height={`${h}mm`} viewBox={`0 0 ${w} ${h}`}>
      <rect x={0} y={0} width={w} height={h} fill={PAPER} />
      <rect x={MARGIN} y={MARGIN} width={frameW} height={h - 2 * MARGIN} fill="none" stroke={INK} strokeWidth={0.5} />

      <g transform={`translate(${ox} ${oy}) scale(${k}) translate(${-bb.minX} ${-bb.minY})`}>
        <PlanColorsContext.Provider value={colors}>
          <PrintMode.Provider value>
            <PlanLayers plan={plan} defs={defs} rooms={rooms} unit={unit} showDims={options.showDims} />
          </PrintMode.Provider>
        </PlanColorsContext.Provider>
      </g>

      {/* North arrow */}
      <g transform={`translate(${area.x + area.w - 8} ${area.y + 9})`}>
        <circle r={6} fill="none" stroke={INK} strokeWidth={0.25} />
        <path d="M0 -5 L3 4 L0 2 L-3 4 Z" fill={INK} />
        <text y={-7.5} textAnchor="middle" fontSize={3} fontFamily={MONO} fill={INK}>
          N
        </text>
      </g>

      {/* Scale bar */}
      <g>
        {Array.from({ length: segs }, (_, i) => (
          <rect key={i} x={barX + i * segMm} y={barY - 1.5} width={segMm} height={1.5} fill={i % 2 ? PAPER : INK} stroke={INK} strokeWidth={0.2} />
        ))}
        {Array.from({ length: segs + 1 }, (_, i) => (
          <text key={i} x={barX + i * segMm} y={barY - 2.8} textAnchor="middle" fontSize={2.2} fontFamily={MONO} fill={INK}>
            {Math.round((i * barMetres) / segs)}
          </text>
        ))}
        <text x={barX + segs * segMm + 3} y={barY} fontSize={2.2} fontFamily={MONO} fill={INK}>
          m
        </text>
      </g>

      {/* Title block */}
      <line x1={MARGIN} y1={tbY} x2={w - MARGIN} y2={tbY} stroke={INK} strokeWidth={0.5} />
      {cells.map(([label, value, frac], i) => {
        const cw = frameW * frac
        const x = cx
        cx += cw
        return (
          <g key={label}>
            {i > 0 && <line x1={x} y1={tbY} x2={x} y2={h - MARGIN} stroke={INK} strokeWidth={0.25} />}
            <text x={x + 3} y={tbY + 5} fontSize={2} fontFamily={MONO} fill={colors.muted}>
              {label}
            </text>
            <text x={x + 3} y={tbY + 14} fontSize={i === 0 ? 5 : 3.4} fontWeight={i === 0 ? 'bold' : undefined} fontFamily={MONO} fill={INK}>
              {value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
