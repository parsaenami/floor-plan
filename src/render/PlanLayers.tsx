import { memo, useMemo } from 'react'
import type { Plan } from '../model/types'
import type { Room } from '../geometry/rooms'
import { formatArea } from '../geometry/rooms'
import { openingFrame, wallGeometry } from '../geometry/walls'
import { openingSymbol } from '../symbols/library'
import { symbolFor } from '../symbols'
import { DimLine } from './DimLine'
import { FALLBACK_DEF, itemSize, itemTransform, type DefMap } from './planGeometry'
import { usePlanColors } from '../theme/themes'
import { HaloText, MONO, Primitives } from './Primitives'

interface Props {
  plan: Plan
  defs: DefMap
  rooms: Room[]
  /** World units (cm) per hairline. */
  unit: number
  showDims: boolean
  /** Adds invisible hit areas and data attributes for the editor. */
  interactive?: boolean
}

const pts = (p: { x: number; y: number }[]) => p.map((q) => `${q.x},${q.y}`).join(' ')

/** The plan drawing itself, shared by the editor, thumbnails and exports. */
export const PlanLayers = memo(function PlanLayers({ plan, defs, rooms, unit, showDims, interactive = false }: Props) {
  const { ink } = usePlanColors()
  const wallById = new Map(plan.walls.map((w) => [w.id, w]))
  const geo = useMemo(() => wallGeometry(plan.walls, plan.openings), [plan.walls, plan.openings])
  const labelled = new Set(rooms.map((r) => r.label?.id).filter(Boolean))

  return (
    <g>
      {/* Furniture */}
      <g>
        {plan.items.map((it) => {
          const def = defs.get(it.defId) ?? FALLBACK_DEF
          const { w, d } = itemSize(it, def)
          return (
            <g key={it.id} transform={itemTransform(it, w, d)} data-kind="item" data-id={it.id}>
              {interactive && <rect width={w} height={d} fill="none" stroke="none" pointerEvents="all" />}
              <Primitives prims={symbolFor(def, w, d)} unit={unit} textRotation={-it.rotation} />
              {it.label && (
                <Primitives prims={[{ t: 'text', x: w / 2, y: d / 2, text: it.label }]} unit={unit} textRotation={-it.rotation} />
              )}
            </g>
          )
        })}
      </g>

      {/* Walls, cut by their openings and mitred where they meet */}
      <g fill={ink}>
        {plan.walls.map((w) => (
          <g key={w.id} data-kind="wall" data-id={w.id}>
            {geo.pieces.get(w.id)?.map((poly, i) => <polygon key={i} points={pts(poly)} />)}
          </g>
        ))}
        {geo.joints.map((j, i) => (
          <polygon key={`j${i}`} points={pts(j)} pointerEvents="none" />
        ))}
      </g>

      {/* Doors and windows */}
      <g>
        {plan.openings.map((o) => {
          const w = wallById.get(o.wallId)
          if (!w) return null
          const { c, angle } = openingFrame(w, o)
          return (
            <g key={o.id} transform={`translate(${c.x} ${c.y}) rotate(${angle})`} data-kind="opening" data-id={o.id}>
              {interactive && (
                <rect x={-o.width / 2} y={-w.thickness / 2} width={o.width} height={w.thickness} fill="none" stroke="none" pointerEvents="all" />
              )}
              <Primitives prims={openingSymbol(o.kind, o.width, w.thickness, o.flipSide, o.flipHinge)} unit={unit} />
            </g>
          )
        })}
      </g>

      {/* Room dimensions */}
      {showDims &&
        rooms.map((r) => (
          <g key={`dims-${r.key}`}>
            {r.inner.map((p, i) => {
              if (r.curved[i]) return null
              const q = r.inner[(i + 1) % r.inner.length]
              return <DimLine key={i} a={p} b={q} offset={-12 * unit} unit={unit} />
            })}
          </g>
        ))}

      {/* Measured dimensions */}
      {plan.dimensions.map((dm) => (
        <g key={dm.id} data-kind="dimension" data-id={dm.id}>
          <DimLine a={dm.a} b={dm.b} offset={dm.offset} unit={unit} extensions />
        </g>
      ))}

      {/* Room names and areas */}
      {rooms
        .filter((r) => !r.label)
        .map((r) => (
          <text
            key={`area-${r.key}`}
            x={r.centroid.x}
            y={r.centroid.y + unit * 9 * 0.35}
            fontSize={unit * 9}
            fontFamily={MONO}
            textAnchor="middle"
            fill={ink}
          >
            {formatArea(r.area)}
          </text>
        ))}
      {plan.roomLabels.map((l) => {
        const room = rooms.find((r) => r.label?.id === l.id)
        return (
          <g key={l.id} data-kind="label" data-id={l.id}>
            {interactive && (
              <rect
                x={l.point.x - unit * 45}
                y={l.point.y - unit * 12}
                width={unit * 90}
                height={unit * (room ? 26 : 16)}
                fill="none"
                stroke="none"
                pointerEvents="all"
              />
            )}
            <HaloText x={l.point.x} y={l.point.y} size={unit * 11} unit={unit} weight={500} spacing={unit * 1.2}>
              {l.name.toUpperCase()}
            </HaloText>
            {room && labelled.has(l.id) && (
              <HaloText x={l.point.x} y={l.point.y + unit * 13} size={unit * 8.5} unit={unit}>
                {formatArea(room.area)}
              </HaloText>
            )}
          </g>
        )
      })}
    </g>
  )
})
