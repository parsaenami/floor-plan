import { createContext, memo, useContext } from 'react'
import { arcPath, type Fill, type Primitive } from '../symbols/primitives'
import { usePlanColors, type PlanColors } from '../theme/themes'

export const MONO = "'JetBrains Mono', ui-monospace, monospace"

/**
 * Print mode is used for exported sheets: svg2pdf mishandles stroked text,
 * numeric font weights and `dy`, so text is drawn plainly there.
 */
export const PrintMode = createContext(false)

const fillOf = (c: PlanColors, f?: Fill) => (f === 'ink' ? c.ink : f === 'paper' ? c.paper : 'none')

interface Props {
  prims: Primitive[]
  /** World units (cm) per hairline. */
  unit: number
  /** Counter-rotation (degrees) so text stays upright inside a rotated item. */
  textRotation?: number
}

export const Primitives = memo(function Primitives({ prims, unit, textRotation = 0 }: Props) {
  const c = usePlanColors()
  return (
    <>
      {prims.map((p, i) => {
        if (p.t === 'text') {
          // Monospace glyphs are ~0.6em wide; shrink long labels to fit their shape.
          const fit = p.maxWidth ? (p.maxWidth * 0.9) / (Math.max(1, p.text.length) * 0.6) : Infinity
          const size = Math.min(unit * 9 * (p.size ?? 1), fit)
          return (
            <text
              key={i}
              x={p.x}
              y={p.y + size * 0.35}
              fontSize={size}
              fontFamily={MONO}
              textAnchor="middle"
              fill={c.ink}
              transform={textRotation ? `rotate(${textRotation} ${p.x} ${p.y})` : undefined}
            >
              {p.text}
            </text>
          )
        }
        const stroke = {
          stroke: c.ink,
          strokeWidth: unit * (p.weight ?? 1),
          strokeDasharray: p.dash ? `${unit * 6} ${unit * 4}` : undefined,
          strokeLinejoin: 'round' as const,
        }
        switch (p.t) {
          case 'line':
            return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} {...stroke} />
          case 'rect':
            return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r} ry={p.r} fill={fillOf(c, p.fill)} {...stroke} />
          case 'ellipse':
            return <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={fillOf(c, p.fill)} {...stroke} />
          case 'poly': {
            const pts = p.pts.map(([x, y]) => `${x},${y}`).join(' ')
            return p.closed ? (
              <polygon key={i} points={pts} fill={fillOf(c, p.fill)} {...stroke} />
            ) : (
              <polyline key={i} points={pts} fill="none" {...stroke} />
            )
          }
          case 'arc':
            return <path key={i} d={arcPath(p)} fill={p.close ? fillOf(c, p.fill) : 'none'} {...stroke} />
        }
      })}
    </>
  )
})

/** Centred text with a paper-coloured halo (drawn as a separate element, skipped in print). */
export function HaloText({
  x,
  y,
  size,
  unit,
  children,
  weight,
  spacing,
  transform,
  middle = false,
}: {
  x: number
  y: number
  size: number
  unit: number
  children: string
  weight?: number
  spacing?: number
  transform?: string
  /** Vertically centre on y instead of sitting on the baseline. */
  middle?: boolean
}) {
  const print = useContext(PrintMode)
  const c = usePlanColors()
  const common = {
    x,
    y: middle ? y + size * 0.35 : y,
    fontSize: size,
    fontFamily: MONO,
    textAnchor: 'middle' as const,
    transform,
  }
  if (print)
    return (
      <text {...common} fontWeight={weight && weight >= 500 ? 'bold' : undefined} fill={c.ink}>
        {children}
      </text>
    )
  return (
    <>
      <text {...common} fontWeight={weight} letterSpacing={spacing} fill={c.paper} stroke={c.paper} strokeWidth={unit * 3} strokeLinejoin="round">
        {children}
      </text>
      <text {...common} fontWeight={weight} letterSpacing={spacing} fill={c.ink}>
        {children}
      </text>
    </>
  )
}
