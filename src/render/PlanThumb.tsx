import { useMemo } from 'react'
import type { Plan } from '../model/types'
import { detectRooms } from '../geometry/rooms'
import { PlanLayers } from './PlanLayers'
import { planBBox, type DefMap } from './planGeometry'

/** Static, non-interactive preview of a plan fitted into its box. */
export function PlanThumb({ plan, defs, width = 320, height = 220 }: { plan: Plan; defs: DefMap; width?: number; height?: number }) {
  const rooms = useMemo(() => detectRooms(plan.walls, plan.roomLabels), [plan.walls, plan.roomLabels])
  const bb = planBBox(plan, defs)
  if (!bb) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" aria-hidden>
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill="#a3a3a3">
          EMPTY PLAN
        </text>
      </svg>
    )
  }
  const pad = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.08 + 20
  const vw = bb.maxX - bb.minX + pad * 2
  const vh = bb.maxY - bb.minY + pad * 2
  const unit = Math.max(vw / width, vh / height) * 0.9
  return (
    <svg viewBox={`${bb.minX - pad} ${bb.minY - pad} ${vw} ${vh}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <PlanLayers plan={plan} defs={defs} rooms={rooms} unit={unit} showDims={false} />
    </svg>
  )
}
