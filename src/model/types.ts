import type { Primitive } from '../symbols/primitives'

/** All plan coordinates are in centimetres, y pointing down (screen convention). */
export interface Pt {
  x: number
  y: number
}

/**
 * Which side of the a→b line the wall thickness sits on. `left` is the left of
 * travel on screen. A missing value means centred (plans saved before walls had a side).
 */
export type WallAlign = 'left' | 'right' | 'center'

export interface Wall {
  id: string
  a: Pt
  b: Pt
  thickness: number
  align?: WallAlign
  /**
   * Curved wall: tan(sweep / 4), as in DXF. 0 or missing is straight, ±0.414 is a
   * quarter circle and ±1 a half circle. Positive bulges to the left of a→b.
   */
  bulge?: number
  /** Locked walls can be selected but not moved, reshaped or deleted; their joints stay put. */
  locked?: boolean
}

export type OpeningKind = 'door' | 'double-door' | 'sliding-door' | 'pocket-door' | 'bifold-door' | 'passage' | 'window'

export interface Opening {
  id: string
  wallId: string
  kind: OpeningKind
  /** Distance from wall.a to the opening centre, along the wall. */
  offset: number
  width: number
  /** Door swings to the other side of the wall. */
  flipSide: boolean
  /** Hinge on the other jamb. */
  flipHinge: boolean
}

export interface Item {
  id: string
  defId: string
  /** Centre of the item. */
  x: number
  y: number
  /** Degrees, clockwise. */
  rotation: number
  /** Size overrides; fall back to the component definition. */
  w?: number
  d?: number
  label?: string
  /** Locked items can be selected but not moved, rotated, resized or deleted. */
  locked?: boolean
}

export interface RoomLabel {
  id: string
  point: Pt
  name: string
}

export interface Dimension {
  id: string
  a: Pt
  b: Pt
  /** Perpendicular offset of the dimension line from a→b, in cm. */
  offset: number
}

export interface PlanSettings {
  gridSize: number
  snap: boolean
  showDims: boolean
  defaultWallThickness: number
}

export interface Plan {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  walls: Wall[]
  openings: Opening[]
  items: Item[]
  roomLabels: RoomLabel[]
  dimensions: Dimension[]
  settings: PlanSettings
  /**
   * Storeys in order. The top-level arrays above hold the active floor's content;
   * the other floors keep theirs here. Missing on plans saved before floors.
   */
  floors?: Floor[]
  /** Id of the active floor, whose content is at the top level. */
  floorId?: string
}

export type FloorContent = Pick<Plan, 'walls' | 'openings' | 'items' | 'roomLabels' | 'dimensions'>

/** A storey. Its content fields are empty while it is the active floor. */
export interface Floor extends Partial<FloorContent> {
  id: string
  name: string
}

export type Category = 'Living' | 'Bedroom' | 'Kitchen' | 'Bathroom' | 'Office' | 'Storage' | 'Structure' | 'Outdoor' | 'Other'

export const CATEGORIES: Category[] = ['Living', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Storage', 'Structure', 'Outdoor', 'Other']

export type PresetShape = 'rect' | 'rounded' | 'ellipse' | 'lshape'

export type SymbolSpec =
  | { kind: 'builtin'; key: string }
  | { kind: 'preset'; shape: PresetShape; /** Arm depth for the L-shape. */ arm?: number }
  /** Shapes drawn by hand in the component builder, in cm inside 0..width × 0..depth. */
  | { kind: 'drawn'; shapes: Primitive[] }

export interface ComponentDef {
  id: string
  name: string
  category: Category
  width: number
  depth: number
  height?: number
  symbol: SymbolSpec
  builtin: boolean
  /** Last edit time, used to merge libraries when syncing. */
  updatedAt?: number
}

export type EntityKind = 'wall' | 'opening' | 'item' | 'label' | 'dimension'

export interface SelectionRef {
  kind: EntityKind
  id: string
}
