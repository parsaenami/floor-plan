import type { Pt } from '../model/types'
import { add, angleDeg, dist, mid, norm, perp, scale, sub } from '../geometry/vec'
import { usePlanColors } from '../theme/themes'
import { formatLength } from '../units/units'
import { useUnits } from '../units/unitsStore'
import { HaloText } from './Primitives'

interface Props {
  a: Pt
  b: Pt
  /** Perpendicular offset of the dimension line (world units, positive = left of a→b on screen). */
  offset: number
  unit: number
  /** Draw extension lines from the measured points to the dimension line. */
  extensions?: boolean
  label?: string
}

/** Architectural dimension line with 45° ticks and the length written above it. */
export function DimLine({ a, b, offset, unit, extensions = false, label }: Props) {
  const { ink } = usePlanColors()
  const units = useUnits()
  const l = dist(a, b)
  if (l < 1) return null
  const d = norm(sub(b, a))
  const n = perp(d)
  const pa = add(a, scale(n, offset))
  const pb = add(b, scale(n, offset))
  const tick = 5 * unit
  const t = scale(norm(add(d, n)), tick)
  let ang = angleDeg(a, b)
  if (ang >= 89.5) ang -= 180
  else if (ang < -90.5) ang += 180
  // Text sits on the outer side of the line, away from the measured edge.
  const textSide = offset >= 0 ? 1 : -1
  const tp = add(mid(pa, pb), scale(n, textSide * 6 * unit))
  const text = label ?? formatLength(l, units)
  const fontSize = unit * 8.5
  const gap = 2 * unit
  return (
    <g stroke={ink} strokeWidth={unit * 0.8} fill="none">
      {extensions && (
        <>
          <line x1={a.x + n.x * gap * Math.sign(offset)} y1={a.y + n.y * gap * Math.sign(offset)} x2={pa.x + n.x * 3 * unit * Math.sign(offset)} y2={pa.y + n.y * 3 * unit * Math.sign(offset)} />
          <line x1={b.x + n.x * gap * Math.sign(offset)} y1={b.y + n.y * gap * Math.sign(offset)} x2={pb.x + n.x * 3 * unit * Math.sign(offset)} y2={pb.y + n.y * 3 * unit * Math.sign(offset)} />
        </>
      )}
      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
      <line x1={pa.x - t.x} y1={pa.y - t.y} x2={pa.x + t.x} y2={pa.y + t.y} strokeWidth={unit * 1.4} />
      <line x1={pb.x - t.x} y1={pb.y - t.y} x2={pb.x + t.x} y2={pb.y + t.y} strokeWidth={unit * 1.4} />
      <g stroke="none">
        <HaloText x={tp.x} y={tp.y} middle size={fontSize} unit={unit} transform={`rotate(${ang} ${tp.x} ${tp.y})`}>
          {text}
        </HaloText>
      </g>
    </g>
  )
}
