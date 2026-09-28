import type { OpeningKind, Pt, SelectionRef } from '../../../model/types'
import type { SnapKind, SnapOptions, SnapResult } from '../../../geometry/snap'

export type Handle =
  | { type: 'item-resize'; id: string; sx: number; sy: number }
  | { type: 'item-rotate'; id: string }
  | { type: 'wall-end'; id: string; end: 'a' | 'b' }
  | { type: 'wall-bend'; id: string }
  | { type: 'dim-end'; id: string; end: 'a' | 'b' }

export interface PointerInfo {
  /** World position, unsnapped. */
  raw: Pt
  screen: Pt
  shift: boolean
  alt: boolean
  meta: boolean
  button: number
  detail: number
  target: SelectionRef | null
  handle: Handle | null
}

export type Preview =
  | { kind: 'wall-chain'; points: Pt[]; cursor: Pt; snap: SnapKind }
  /** An arc wall being drawn: chord a→b, bulging through the pointer. */
  | { kind: 'arc-wall'; a: Pt; b: Pt; bulge: number; snap: SnapKind }
  | { kind: 'rect'; a: Pt; b: Pt }
  | { kind: 'opening'; wallId: string; offset: number; width: number; openingKind: OpeningKind }
  | { kind: 'measure'; a: Pt; b: Pt }
  | { kind: 'marquee'; a: Pt; b: Pt }
  | { kind: 'cursor'; p: Pt; snap: SnapKind }

export interface ToolContext {
  /** Screen pixels per cm. */
  zoom: () => number
  snap: (raw: Pt, opts?: Partial<SnapOptions>, alt?: boolean) => SnapResult
  setPreview: (p: Preview | null) => void
}

export interface Tool {
  down?(e: PointerInfo): void
  move?(e: PointerInfo): void
  up?(e: PointerInfo): void
  dblclick?(e: PointerInfo): void
  /** Returns true when the key was handled. */
  key?(e: KeyboardEvent): boolean
  cancel?(): void
  cursor?: string
}
