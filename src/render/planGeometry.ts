import type { ComponentDef, Item, Plan, Pt } from '../model/types'
import { bboxOf, rotate, type BBox } from '../geometry/vec'
import { wallPolygon } from '../geometry/walls'

export type DefMap = Map<string, ComponentDef>

export const FALLBACK_DEF: ComponentDef = {
  id: 'missing',
  name: 'Missing component',
  category: 'Other',
  width: 50,
  depth: 50,
  symbol: { kind: 'preset', shape: 'rect' },
  builtin: false,
}

export function itemSize(item: Item, def: ComponentDef | undefined): { w: number; d: number } {
  return { w: item.w ?? def?.width ?? FALLBACK_DEF.width, d: item.d ?? def?.depth ?? FALLBACK_DEF.depth }
}

/** Transform from local symbol space (0..w, 0..d) into world space. */
export const itemTransform = (item: Item, w: number, d: number) =>
  `translate(${item.x} ${item.y}) rotate(${item.rotation}) translate(${-w / 2} ${-d / 2})`

export function itemCorners(item: Item, w: number, d: number): Pt[] {
  const c = { x: item.x, y: item.y }
  return [
    { x: item.x - w / 2, y: item.y - d / 2 },
    { x: item.x + w / 2, y: item.y - d / 2 },
    { x: item.x + w / 2, y: item.y + d / 2 },
    { x: item.x - w / 2, y: item.y + d / 2 },
  ].map((p) => rotate(p, item.rotation, c))
}

/** Local symbol point → world point for an item. */
export function itemLocalToWorld(item: Item, w: number, d: number, p: Pt): Pt {
  return rotate({ x: item.x + p.x - w / 2, y: item.y + p.y - d / 2 }, item.rotation, { x: item.x, y: item.y })
}

export function planBBox(plan: Plan, defs: DefMap): BBox | null {
  const pts: Pt[] = []
  for (const w of plan.walls) pts.push(...wallPolygon(w))
  for (const it of plan.items) {
    const { w, d } = itemSize(it, defs.get(it.defId))
    pts.push(...itemCorners(it, w, d))
  }
  for (const l of plan.roomLabels) pts.push(l.point)
  for (const dim of plan.dimensions) pts.push(dim.a, dim.b)
  return bboxOf(pts)
}
