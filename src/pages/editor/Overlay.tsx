import type { Plan, Pt, SelectionRef, Wall } from '../../model/types'
import { add, dist, perp, scale } from '../../geometry/vec'
import {
  bandCenter,
  isCurved,
  pointAlong,
  rectRoomWalls,
  sweepOf,
  wallArc,
  wallBand,
  wallFrame,
  wallLength,
  wallPath,
  wallPolygon,
} from '../../geometry/walls'
import { openingSymbol } from '../../symbols/library'
import { DimLine } from '../../render/DimLine'
import { itemCorners, itemLocalToWorld, itemSize, type DefMap } from '../../render/planGeometry'
import { HaloText, Primitives } from '../../render/Primitives'
import { usePlanColors } from '../../theme/themes'
import type { Preview } from './tools/types'

const pts = (p: Pt[]) => p.map((q) => `${q.x},${q.y}`).join(' ')

/** Dashed outline with a paper halo so it reads on both paper and solid walls. */
function Outline({ points, unit }: { points: Pt[]; unit: number }) {
  const c = usePlanColors()
  return (
    <g fill="none" pointerEvents="none">
      <polygon points={pts(points)} stroke={c.paper} strokeWidth={unit * 3} />
      <polygon points={pts(points)} stroke={c.ink} strokeWidth={unit} strokeDasharray={`${unit * 4} ${unit * 3}`} />
    </g>
  )
}

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']

function resizeCursor(sx: number, sy: number, rotation: number) {
  const a = (Math.atan2(sy, sx) * 180) / Math.PI + rotation
  const idx = Math.round((((a % 180) + 180) % 180) / 45) % 4
  return RESIZE_CURSORS[idx]
}

function Handle({ p, unit, data, cursor, round }: { p: Pt; unit: number; data: Record<string, string>; cursor: string; round?: boolean }) {
  const c = usePlanColors()
  const s = unit * 8
  const attrs = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]))
  return round ? (
    <circle cx={p.x} cy={p.y} r={s / 2 + unit} fill={c.paper} stroke={c.ink} strokeWidth={unit} style={{ cursor }} {...attrs} />
  ) : (
    <rect x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} fill={c.paper} stroke={c.ink} strokeWidth={unit} style={{ cursor }} {...attrs} />
  )
}

/** Small padlock centred on p, marking a locked item. */
function LockGlyph({ p, unit }: { p: Pt; unit: number }) {
  const c = usePlanColors()
  const u = unit
  return (
    <g pointerEvents="none" transform={`translate(${p.x} ${p.y})`} stroke={c.ink} strokeWidth={u}>
      <circle r={8 * u} fill={c.paper} />
      <path d={`M ${-2.5 * u} ${-u} v ${-2 * u} a ${2.5 * u} ${2.5 * u} 0 0 1 ${5 * u} 0 v ${2 * u}`} fill="none" />
      <rect x={-4 * u} y={-u} width={8 * u} height={5.5 * u} rx={u} fill={c.ink} />
    </g>
  )
}

/** Point on a wall at arc length s, pushed sideways by `offset`. */
function sidePoint(w: Wall, s: number, offset: number): Pt {
  const f = wallFrame(w, s)
  return add(f.p, scale(perp(f.dir), offset))
}

/** Length for straight walls; arc length, radius and sweep for curved ones. */
function WallDims({ w, unit }: { w: Omit<Wall, 'id'>; unit: number }) {
  const [lo, hi] = wallBand(w)
  const arc = wallArc(w)
  if (!arc) return <DimLine a={w.a} b={w.b} offset={hi + 16 * unit} unit={unit} />
  const l = wallLength(w)
  const f = wallFrame(w, l / 2)
  // Write the figures on the concave side of the arc, clear of the wall body.
  const side = -Math.sign(w.bulge ?? 1)
  const body = side > 0 ? hi : -lo
  const p = add(f.p, scale(perp(f.dir), side * (Math.max(0, body) + 14 * unit)))
  return (
    <HaloText x={p.x} y={p.y} middle size={unit * 8.5} unit={unit}>
      {`${Math.round(l)} · R${Math.round(arc.r)} · ${Math.round(Math.abs(sweepOf(w)))}°`}
    </HaloText>
  )
}

export function Overlay({
  plan,
  defs,
  selection,
  unit,
  interactiveHandles,
}: {
  plan: Plan
  defs: DefMap
  selection: SelectionRef[]
  unit: number
  interactiveHandles: boolean
}) {
  const c = usePlanColors()
  const single = selection.length === 1
  return (
    <g pointerEvents={interactiveHandles ? undefined : 'none'}>
      {selection.map((s) => {
        switch (s.kind) {
          case 'item': {
            const it = plan.items.find((i) => i.id === s.id)
            if (!it) return null
            const { w, d } = itemSize(it, defs.get(it.defId))
            const corners = itemCorners(it, w, d)
            return (
              <g key={s.id}>
                <Outline points={corners} unit={unit} />
                {it.locked && <LockGlyph p={itemLocalToWorld(it, w, d, { x: w, y: 0 })} unit={unit} />}
                {single && !it.locked && (
                  <>
                    {[-1, 0, 1].flatMap((sx) =>
                      [-1, 0, 1]
                        .filter((sy) => sx || sy)
                        .map((sy) => (
                          <Handle
                            key={`${sx}${sy}`}
                            p={itemLocalToWorld(it, w, d, { x: (w * (sx + 1)) / 2, y: (d * (sy + 1)) / 2 })}
                            unit={unit}
                            cursor={resizeCursor(sx, sy, it.rotation)}
                            data={{ handle: 'item-resize', id: it.id, sx: String(sx), sy: String(sy) }}
                          />
                        )),
                    )}
                    <line
                      {...lineAttrs(itemLocalToWorld(it, w, d, { x: w / 2, y: 0 }), itemLocalToWorld(it, w, d, { x: w / 2, y: -22 * unit }))}
                      stroke={c.ink}
                      strokeWidth={unit}
                      pointerEvents="none"
                    />
                    <Handle
                      p={itemLocalToWorld(it, w, d, { x: w / 2, y: -22 * unit })}
                      unit={unit}
                      round
                      cursor="grab"
                      data={{ handle: 'item-rotate', id: it.id }}
                    />
                  </>
                )}
              </g>
            )
          }
          case 'wall': {
            const w = plan.walls.find((x) => x.id === s.id)
            if (!w) return null
            return (
              <g key={s.id}>
                <Outline points={wallPolygon(w)} unit={unit} />
                <g pointerEvents="none">
                  <WallDims w={w} unit={unit} />
                </g>
                {single && (
                  <>
                    <Handle p={w.a} unit={unit} cursor="move" data={{ handle: 'wall-end', id: w.id, end: 'a' }} />
                    <Handle p={w.b} unit={unit} cursor="move" data={{ handle: 'wall-end', id: w.id, end: 'b' }} />
                    {/* Drag the middle of a wall to bend it into an arc. */}
                    <Handle
                      p={pointAlong(w, wallLength(w) / 2)}
                      unit={unit}
                      round
                      cursor="pointer"
                      data={{ handle: 'wall-bend', id: w.id }}
                    />
                  </>
                )}
              </g>
            )
          }
          case 'opening': {
            const o = plan.openings.find((x) => x.id === s.id)
            const w = o && plan.walls.find((x) => x.id === o.wallId)
            if (!o || !w) return null
            const [lo] = wallBand(w)
            const s0 = o.offset - o.width / 2
            const s1 = o.offset + o.width / 2
            return (
              <g key={s.id}>
                <Outline points={wallPolygon(w, s0, s1)} unit={unit} />
                <g pointerEvents="none">
                  <DimLine a={sidePoint(w, s0, lo)} b={sidePoint(w, s1, lo)} offset={-14 * unit} unit={unit} />
                </g>
              </g>
            )
          }
          case 'label': {
            const l = plan.roomLabels.find((x) => x.id === s.id)
            if (!l) return null
            const hw = Math.max(30, l.name.length * 4.2 + 12) * unit
            const { x, y } = l.point
            return (
              <Outline
                key={s.id}
                unit={unit}
                points={[
                  { x: x - hw, y: y - 14 * unit },
                  { x: x + hw, y: y - 14 * unit },
                  { x: x + hw, y: y + 18 * unit },
                  { x: x - hw, y: y + 18 * unit },
                ]}
              />
            )
          }
          case 'dimension': {
            const dm = plan.dimensions.find((x) => x.id === s.id)
            if (!dm) return null
            return (
              <g key={s.id}>
                <line {...lineAttrs(dm.a, dm.b)} stroke={c.ink} strokeWidth={unit} strokeDasharray={`${unit * 4} ${unit * 3}`} pointerEvents="none" />
                {single && (
                  <>
                    <Handle p={dm.a} unit={unit} cursor="move" data={{ handle: 'dim-end', id: dm.id, end: 'a' }} />
                    <Handle p={dm.b} unit={unit} cursor="move" data={{ handle: 'dim-end', id: dm.id, end: 'b' }} />
                  </>
                )}
              </g>
            )
          }
        }
      })}
    </g>
  )
}

const lineAttrs = (a: Pt, b: Pt) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })

function SnapMark({ p, kind, unit }: { p: Pt; kind: string; unit: number }) {
  const { ink } = usePlanColors()
  const s = 5 * unit
  if (kind === 'endpoint')
    return <rect x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} fill="none" stroke={ink} strokeWidth={unit * 1.5} />
  if (kind === 'wall')
    return <polygon points={pts([{ x: p.x, y: p.y - s }, { x: p.x + s, y: p.y }, { x: p.x, y: p.y + s }, { x: p.x - s, y: p.y }])} fill="none" stroke={ink} strokeWidth={unit * 1.5} />
  return (
    <g stroke={ink} strokeWidth={unit}>
      <line x1={p.x - s} y1={p.y} x2={p.x + s} y2={p.y} />
      <line x1={p.x} y1={p.y - s} x2={p.x} y2={p.y + s} />
    </g>
  )
}

export function PreviewLayer({ plan, preview, unit }: { plan: Plan; preview: Preview | null; unit: number }) {
  const c = usePlanColors()
  if (!preview) return null
  const t = plan.settings.defaultWallThickness
  const ghost = { fill: c.ink, fillOpacity: 0.28, stroke: c.ink, strokeWidth: unit }
  let body: React.ReactNode = null
  switch (preview.kind) {
    case 'cursor':
      body = <SnapMark p={preview.p} kind={preview.snap} unit={unit} />
      break
    case 'wall-chain': {
      const a = preview.points[preview.points.length - 1]
      const b = preview.cursor
      const wall = { a, b, thickness: t, align: 'left' as const }
      body = (
        <>
          {dist(a, b) > 0.5 && (
            <>
              <polygon points={pts(wallPolygon(wall))} {...ghost} />
              <WallDims w={wall} unit={unit} />
            </>
          )}
          <SnapMark p={b} kind={preview.snap} unit={unit} />
        </>
      )
      break
    }
    case 'arc-wall': {
      const wall = { a: preview.a, b: preview.b, thickness: t, align: 'left' as const, bulge: preview.bulge }
      body = (
        <>
          {dist(wall.a, wall.b) > 0.5 && (
            <>
              <polygon points={pts(wallPolygon(wall))} {...ghost} />
              {isCurved(wall) && (
                <polyline
                  points={pts([wall.a, wall.b])}
                  fill="none"
                  stroke={c.ink}
                  strokeWidth={unit}
                  strokeDasharray={`${unit * 4} ${unit * 3}`}
                />
              )}
              <WallDims w={wall} unit={unit} />
            </>
          )}
          <SnapMark p={wall.b} kind={preview.snap} unit={unit} />
        </>
      )
      break
    }
    case 'rect': {
      const { a, b } = preview
      const x0 = Math.min(a.x, b.x)
      const y0 = Math.min(a.y, b.y)
      const x1 = Math.max(a.x, b.x)
      const y1 = Math.max(a.y, b.y)
      body = (
        <>
          {rectRoomWalls(a, b).map(([p, q], i) => (
            // Each wall reaches back over the corner it starts at, so corners are covered once.
            <polygon key={i} points={pts(wallPolygon({ a: p, b: q, thickness: t, align: 'left' }, -t, dist(p, q)))} {...ghost} />
          ))}
          <DimLine a={{ x: x0, y: y0 }} b={{ x: x1, y: y0 }} offset={-14 * unit} unit={unit} />
          <DimLine a={{ x: x0, y: y1 }} b={{ x: x0, y: y0 }} offset={-14 * unit} unit={unit} />
          <text
            x={(x0 + x1) / 2}
            y={(y0 + y1) / 2}
            dy="0.35em"
            textAnchor="middle"
            fontSize={unit * 11}
            fontFamily="var(--font-mono)"
            fill={c.ink}
          >
            {(((x1 - x0) * (y1 - y0)) / 10000).toFixed(2)} m²
          </text>
        </>
      )
      break
    }
    case 'opening': {
      const w = plan.walls.find((x) => x.id === preview.wallId)
      if (!w) return null
      const s0 = preview.offset - preview.width / 2
      const s1 = preview.offset + preview.width / 2
      const f = wallFrame(w, preview.offset)
      const center = add(f.p, scale(perp(f.dir), bandCenter(w)))
      const angle = (Math.atan2(f.dir.y, f.dir.x) * 180) / Math.PI
      const [, hi] = wallBand(w)
      body = (
        <>
          <polygon points={pts(wallPolygon(w, s0, s1))} fill={c.paper} stroke="none" />
          <g transform={`translate(${center.x} ${center.y}) rotate(${angle})`} opacity={0.75}>
            <Primitives prims={openingSymbol(preview.openingKind, preview.width, w.thickness, false, false)} unit={unit} />
          </g>
          {!isCurved(w) && (
            <>
              <DimLine a={w.a} b={pointAlong(w, s0)} offset={hi + 16 * unit} unit={unit} />
              <DimLine a={pointAlong(w, s1)} b={w.b} offset={hi + 16 * unit} unit={unit} />
            </>
          )}
          {isCurved(w) && (
            <polyline points={pts(wallPath(w, s0, s1, hi + 6 * unit))} fill="none" stroke={c.ink} strokeWidth={unit} />
          )}
        </>
      )
      break
    }
    case 'measure':
      body = <DimLine a={preview.a} b={preview.b} offset={30} unit={unit} extensions />
      break
    case 'marquee': {
      const { a, b } = preview
      body = (
        <rect
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(a.x - b.x)}
          height={Math.abs(a.y - b.y)}
          fill={c.ink}
          fillOpacity={0.04}
          stroke={c.ink}
          strokeWidth={unit}
          strokeDasharray={`${unit * 4} ${unit * 3}`}
        />
      )
      break
    }
  }
  return <g pointerEvents="none">{body}</g>
}
