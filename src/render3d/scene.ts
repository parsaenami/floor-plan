import type { ComponentDef, Item, OpeningKind, Plan, Pt } from '../model/types'
import { detectRooms } from '../geometry/rooms'
import { wallGeometry, wallPolygon } from '../geometry/walls'
import { itemCorners, itemLocalToWorld, itemSize, type DefMap } from '../render/planGeometry'

/** Heights in cm. */
export const WALL_HEIGHT = 250
export const DOOR_HEIGHT = 210
export const SILL_HEIGHT = 90
/** Items without a height lie flat on the floor, like rugs and shower trays. */
const FLAT_HEIGHT = 2
const FLOOR_THICKNESS = 1

/** Built-in pieces that hang on the wall rather than stand on the floor. */
const MOUNTED_AT: Record<string, number> = {
  'builtin:wall-cabinet': 145,
  'builtin:range-hood': 150,
}

/** Built-in pieces with a round footprint. */
const ROUND = new Set(['builtin:round-table', 'builtin:column-round', 'builtin:plant', 'builtin:stairs-spiral', 'builtin:floor-lamp', 'builtin:bar-stool'])
const ROUND_SEGMENTS = 32

export type SolidKind = 'wall' | 'floor' | 'item' | 'glass'

/** A vertical prism: a plan-space footprint (cm, y down) extruded from z0 up to z1. */
export interface Solid {
  kind: SolidKind
  footprint: Pt[]
  z0: number
  z1: number
}

export interface Scene3D {
  solids: Solid[]
  /** Plan-space extent of the solids, for framing the camera. */
  bounds: { min: Pt; max: Pt } | null
}

/** What fills the wall above and below an opening: [z0, z1] spans of solid wall. */
function openingSpans(kind: OpeningKind): { solid: [number, number][]; glass?: [number, number] } {
  if (kind === 'window') return { solid: [[0, SILL_HEIGHT], [DOOR_HEIGHT, WALL_HEIGHT]], glass: [SILL_HEIGHT, DOOR_HEIGHT] }
  return { solid: [[DOOR_HEIGHT, WALL_HEIGHT]] }
}

function itemFootprint(item: Item, def: ComponentDef | undefined, w: number, d: number): Pt[] {
  const round = (def && ROUND.has(def.id)) || (def?.symbol.kind === 'preset' && def.symbol.shape === 'ellipse')
  if (!round) return itemCorners(item, w, d)
  return Array.from({ length: ROUND_SEGMENTS }, (_, i) => {
    const t = (i / ROUND_SEGMENTS) * Math.PI * 2
    return itemLocalToWorld(item, w, d, { x: w / 2 + (Math.cos(t) * w) / 2, y: d / 2 + (Math.sin(t) * d) / 2 })
  })
}

/** Turns a plan into extruded solids: walls with their openings cut, room floors and furniture blocks. */
export function planScene(plan: Plan, defs: DefMap): Scene3D {
  const solids: Solid[] = []

  for (const room of detectRooms(plan.walls, plan.roomLabels)) {
    solids.push({ kind: 'floor', footprint: room.inner, z0: -FLOOR_THICKNESS, z1: 0 })
  }

  const { pieces, joints } = wallGeometry(plan.walls, plan.openings)
  for (const polys of pieces.values()) for (const footprint of polys) solids.push({ kind: 'wall', footprint, z0: 0, z1: WALL_HEIGHT })
  for (const footprint of joints) solids.push({ kind: 'wall', footprint, z0: 0, z1: WALL_HEIGHT })

  const walls = new Map(plan.walls.map((w) => [w.id, w]))
  for (const o of plan.openings) {
    const w = walls.get(o.wallId)
    if (!w) continue
    const footprint = wallPolygon(w, o.offset - o.width / 2, o.offset + o.width / 2)
    const { solid, glass } = openingSpans(o.kind)
    for (const [z0, z1] of solid) solids.push({ kind: 'wall', footprint, z0, z1 })
    if (glass) solids.push({ kind: 'glass', footprint, z0: glass[0], z1: glass[1] })
  }

  for (const it of plan.items) {
    const def = defs.get(it.defId)
    const { w, d } = itemSize(it, def)
    const z0 = MOUNTED_AT[it.defId] ?? 0
    solids.push({ kind: 'item', footprint: itemFootprint(it, def, w, d), z0, z1: z0 + (def?.height || FLAT_HEIGHT) })
  }

  return { solids, bounds: boundsOf(solids) }
}

function boundsOf(solids: Solid[]): Scene3D['bounds'] {
  let min: Pt | null = null
  let max: Pt | null = null
  for (const s of solids)
    for (const p of s.footprint) {
      min = min ? { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y) } : p
      max = max ? { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y) } : p
    }
  return min && max ? { min, max } : null
}
