import type { ComponentDef } from '../model/types'
import { symbolFor } from '../symbols'
import { DimLine } from './DimLine'
import { Primitives } from './Primitives'

/** A component symbol fitted into a box, optionally with its dimensions. */
export function SymbolPreview({
  def,
  size = 56,
  dims = false,
  w = def.width,
  d = def.depth,
}: {
  def: ComponentDef
  size?: number
  dims?: boolean
  w?: number
  d?: number
}) {
  const pad = dims ? Math.max(w, d) * 0.28 : Math.max(w, d) * 0.08
  const vw = w + pad * 2
  const vh = d + pad * 2
  const unit = Math.max(vw, vh) / size
  return (
    <svg viewBox={`${-pad} ${-pad} ${vw} ${vh}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <Primitives prims={symbolFor(def, w, d)} unit={unit} />
      {dims && (
        <>
          <DimLine a={{ x: 0, y: 0 }} b={{ x: w, y: 0 }} offset={12 * unit} unit={unit} extensions />
          <DimLine a={{ x: 0, y: d }} b={{ x: 0, y: 0 }} offset={12 * unit} unit={unit} extensions />
        </>
      )}
    </svg>
  )
}
