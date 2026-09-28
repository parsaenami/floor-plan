import type { Plan, Pt, SelectionRef, Wall, WallAlign } from './types'
import { uid } from './defaults'
import { add, eq, perp, pointInPolygon, rotate, scale } from '../geometry/vec'
import { JOINT_EPS, clampOpeningOffset, wallFrame, wallLength } from '../geometry/walls'
import { detectRooms } from '../geometry/rooms'

const ids = (sel: SelectionRef[], kind: SelectionRef['kind']) => new Set(sel.filter((s) => s.kind === kind).map((s) => s.id))

export function addWalls(plan: Plan, segments: [Pt, Pt][], thickness: number, align: WallAlign = 'left', bulge?: number): Wall[] {
  const walls = segments
    .filter(([a, b]) => !eq(a, b, 1))
    .map(([a, b]): Wall => ({ id: uid(), a: { ...a }, b: { ...b }, thickness, align, ...(bulge ? { bulge } : {}) }))
  plan.walls.push(...walls)
  return walls
}

/**
 * Puts each wall's thickness on the side facing away from the room it bounds,
 * so its line is the room's inner face. Walls with a room on both sides, or on
 * neither, keep their side. Centred walls are left alone unless `includeCentred`.
 */
export function orientWalls(plan: Plan, ids?: Set<string>, includeCentred = false) {
  const rooms = detectRooms(plan.walls)
  if (!rooms.length) return
  const inRoom = (p: Pt) => rooms.some((r) => pointInPolygon(p, r.outline))
  for (const w of plan.walls) {
    if (ids && !ids.has(w.id)) continue
    if (!includeCentred && (w.align ?? 'center') === 'center') continue
    const f = wallFrame(w, wallLength(w) / 2)
    const n = perp(f.dir)
    const left = inRoom(add(f.p, scale(n, 1)))
    const right = inRoom(add(f.p, scale(n, -1)))
    if (left && !right) w.align = 'right'
    else if (right && !left) w.align = 'left'
    else if (includeCentred && !w.align) w.align = 'left'
  }
}

/** Keeps every opening inside its (possibly resized) wall. */
export function clampOpenings(plan: Plan) {
  const byId = new Map(plan.walls.map((w) => [w.id, w]))
  plan.openings = plan.openings.filter((o) => byId.has(o.wallId))
  for (const o of plan.openings) {
    const w = byId.get(o.wallId)!
    o.offset = clampOpeningOffset(w, o.width, o.offset)
  }
}

/** Moves every wall endpoint located at one of `points` by `delta`. */
function moveJointsAt(plan: Plan, points: Pt[], delta: Pt) {
  for (const w of plan.walls) {
    if (points.some((p) => eq(w.a, p, JOINT_EPS))) w.a = add(w.a, delta)
    if (points.some((p) => eq(w.b, p, JOINT_EPS))) w.b = add(w.b, delta)
  }
}

export function moveJoint(plan: Plan, from: Pt, to: Pt) {
  moveJointsAt(plan, [from], { x: to.x - from.x, y: to.y - from.y })
  clampOpenings(plan)
}

/** Translates the selected entities; moved walls drag connected walls along. */
export function translateSelection(plan: Plan, sel: SelectionRef[], delta: Pt) {
  const wallIds = ids(sel, 'wall')
  if (wallIds.size) {
    const joints: Pt[] = []
    for (const w of plan.walls) if (wallIds.has(w.id)) joints.push({ ...w.a }, { ...w.b })
    moveJointsAt(plan, joints, delta)
    clampOpenings(plan)
  }
  const itemIds = ids(sel, 'item')
  for (const it of plan.items) {
    if (itemIds.has(it.id) && !it.locked) {
      it.x += delta.x
      it.y += delta.y
    }
  }
  const labelIds = ids(sel, 'label')
  for (const l of plan.roomLabels) if (labelIds.has(l.id)) l.point = add(l.point, delta)
  const dimIds = ids(sel, 'dimension')
  for (const d of plan.dimensions) {
    if (dimIds.has(d.id)) {
      d.a = add(d.a, delta)
      d.b = add(d.b, delta)
    }
  }
}

export function deleteSelection(plan: Plan, sel: SelectionRef[]) {
  const wallIds = ids(sel, 'wall')
  const openingIds = ids(sel, 'opening')
  const itemIds = ids(sel, 'item')
  const labelIds = ids(sel, 'label')
  const dimIds = ids(sel, 'dimension')
  plan.walls = plan.walls.filter((w) => !wallIds.has(w.id))
  plan.openings = plan.openings.filter((o) => !openingIds.has(o.id) && !wallIds.has(o.wallId))
  plan.items = plan.items.filter((i) => !itemIds.has(i.id) || i.locked)
  plan.roomLabels = plan.roomLabels.filter((l) => !labelIds.has(l.id))
  plan.dimensions = plan.dimensions.filter((d) => !dimIds.has(d.id))
}

/** Copies the selection with an offset and returns the new selection. */
export function duplicateSelection(plan: Plan, sel: SelectionRef[], offset: Pt): SelectionRef[] {
  const out: SelectionRef[] = []
  const wallMap = new Map<string, string>()
  for (const w of plan.walls.filter((w) => ids(sel, 'wall').has(w.id))) {
    const id = uid()
    wallMap.set(w.id, id)
    plan.walls.push({ ...w, id, a: add(w.a, offset), b: add(w.b, offset) })
    out.push({ kind: 'wall', id })
  }
  const openingIds = ids(sel, 'opening')
  for (const o of plan.openings.filter((o) => wallMap.has(o.wallId) || openingIds.has(o.id))) {
    const copiedWall = wallMap.get(o.wallId)
    // An opening duplicated on its own stays on the same wall, shifted along it.
    const id = uid()
    plan.openings.push(copiedWall ? { ...o, id, wallId: copiedWall } : { ...o, id, offset: o.offset + o.width + 10 })
    if (!copiedWall) out.push({ kind: 'opening', id })
  }
  for (const it of plan.items.filter((i) => ids(sel, 'item').has(i.id))) {
    const id = uid()
    plan.items.push({ ...it, id, x: it.x + offset.x, y: it.y + offset.y })
    out.push({ kind: 'item', id })
  }
  for (const l of plan.roomLabels.filter((l) => ids(sel, 'label').has(l.id))) {
    const id = uid()
    plan.roomLabels.push({ ...l, id, point: add(l.point, offset) })
    out.push({ kind: 'label', id })
  }
  for (const d of plan.dimensions.filter((d) => ids(sel, 'dimension').has(d.id))) {
    const id = uid()
    plan.dimensions.push({ ...d, id, a: add(d.a, offset), b: add(d.b, offset) })
    out.push({ kind: 'dimension', id })
  }
  clampOpenings(plan)
  return out
}

/** Rotates selected items about their own centres, or a group about its centre. */
export function rotateSelection(plan: Plan, sel: SelectionRef[], deg: number) {
  const itemIds = ids(sel, 'item')
  const items = plan.items.filter((i) => itemIds.has(i.id) && !i.locked)
  if (!items.length) return
  const norm = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180
  if (items.length === 1) {
    items[0].rotation = norm(items[0].rotation + deg)
    return
  }
  const c = { x: items.reduce((s, i) => s + i.x, 0) / items.length, y: items.reduce((s, i) => s + i.y, 0) / items.length }
  for (const it of items) {
    const p = rotate({ x: it.x, y: it.y }, deg, c)
    it.x = p.x
    it.y = p.y
    it.rotation = norm(it.rotation + deg)
  }
}

/** True when the selection has items and all of them are locked. */
export function allLocked(plan: Plan, sel: SelectionRef[]) {
  const items = plan.items.filter((i) => ids(sel, 'item').has(i.id))
  return items.length > 0 && items.every((i) => i.locked)
}

/** Locks the selected items, or unlocks them if all are already locked. */
export function toggleLock(plan: Plan, sel: SelectionRef[]) {
  const unlock = allLocked(plan, sel)
  for (const it of plan.items.filter((i) => ids(sel, 'item').has(i.id))) {
    if (unlock) delete it.locked
    else it.locked = true
  }
}

export function selectAll(plan: Plan): SelectionRef[] {
  return [
    ...plan.walls.map((w) => ({ kind: 'wall' as const, id: w.id })),
    ...plan.openings.map((o) => ({ kind: 'opening' as const, id: o.id })),
    ...plan.items.map((i) => ({ kind: 'item' as const, id: i.id })),
    ...plan.roomLabels.map((l) => ({ kind: 'label' as const, id: l.id })),
    ...plan.dimensions.map((d) => ({ kind: 'dimension' as const, id: d.id })),
  ]
}

export type ZMove = 'front' | 'forward' | 'backward' | 'back'

/**
 * Restacks the selected items. Items later in the list draw on top, so
 * "forward" swaps each selected item with the next unselected one above it.
 */
export function reorderItems(plan: Plan, sel: SelectionRef[], move: ZMove) {
  const picked = ids(sel, 'item')
  if (!picked.size) return
  const items = plan.items
  if (move === 'front' || move === 'back') {
    const chosen = items.filter((i) => picked.has(i.id))
    const rest = items.filter((i) => !picked.has(i.id))
    plan.items = move === 'front' ? [...rest, ...chosen] : [...chosen, ...rest]
    return
  }
  const next = [...items]
  if (move === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) {
      if (picked.has(next[i].id) && !picked.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]]
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (picked.has(next[i].id) && !picked.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]]
    }
  }
  plan.items = next
}

/** Where the selected items sit in the stack: can they still move up or down? */
export function stackRoom(plan: Plan, sel: SelectionRef[]): { up: boolean; down: boolean } {
  const picked = ids(sel, 'item')
  const idx = plan.items.flatMap((it, i) => (picked.has(it.id) ? [i] : []))
  if (!idx.length) return { up: false, down: false }
  const n = plan.items.length
  // Movable when the selection is not already a solid block at that end.
  return { up: idx[0] < n - idx.length, down: idx[idx.length - 1] > idx.length - 1 }
}
