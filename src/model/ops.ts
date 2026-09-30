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
    if ((ids && !ids.has(w.id)) || w.locked) continue
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

/** True when a locked wall ends at p, which pins every wall meeting there. */
export const isPinned = (plan: Plan, p: Pt) => plan.walls.some((w) => w.locked && (eq(w.a, p, JOINT_EPS) || eq(w.b, p, JOINT_EPS)))

/** Moves every wall endpoint located at one of `points` by `delta`, except at joints pinned by a locked wall. */
function moveJointsAt(plan: Plan, points: Pt[], delta: Pt) {
  points = points.filter((p) => !isPinned(plan, p))
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
  // Locked walls survive, and so do the openings in them.
  for (const w of plan.walls) if (w.locked) wallIds.delete(w.id)
  plan.walls = plan.walls.filter((w) => !wallIds.has(w.id))
  plan.openings = plan.openings.filter((o) => !openingIds.has(o.id) && !wallIds.has(o.wallId))
  plan.items = plan.items.filter((i) => !itemIds.has(i.id) || i.locked)
  plan.roomLabels = plan.roomLabels.filter((l) => !labelIds.has(l.id))
  plan.dimensions = plan.dimensions.filter((d) => !dimIds.has(d.id))
}

/** Entities lifted out of a plan, as held on the clipboard. */
export type Clip = Pick<Plan, 'walls' | 'openings' | 'items' | 'roomLabels' | 'dimensions'>

/** Deep copies the selection; openings come along with their walls. */
export function copySelection(plan: Plan, sel: SelectionRef[]): Clip {
  const wallIds = ids(sel, 'wall')
  const openingIds = ids(sel, 'opening')
  return structuredClone({
    walls: plan.walls.filter((w) => wallIds.has(w.id)),
    openings: plan.openings.filter((o) => wallIds.has(o.wallId) || openingIds.has(o.id)),
    items: plan.items.filter((i) => ids(sel, 'item').has(i.id)),
    roomLabels: plan.roomLabels.filter((l) => ids(sel, 'label').has(l.id)),
    dimensions: plan.dimensions.filter((d) => ids(sel, 'dimension').has(d.id)),
  })
}

/** Centre of the points in a clip, or null when it is empty. */
export function clipCenter(clip: Clip): Pt | null {
  const pts = [
    ...clip.walls.flatMap((w) => [w.a, w.b]),
    ...clip.items.map((i) => ({ x: i.x, y: i.y })),
    ...clip.roomLabels.map((l) => l.point),
    ...clip.dimensions.flatMap((d) => [d.a, d.b]),
  ]
  if (!pts.length) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

/**
 * Adds a clip to the plan with fresh ids, shifted by `offset`, and returns the
 * new selection. An opening copied without its wall goes onto the same wall,
 * shifted along it, if the plan has that wall; otherwise it is dropped.
 */
export function pasteClip(plan: Plan, clip: Clip, offset: Pt): SelectionRef[] {
  const out: SelectionRef[] = []
  const wallMap = new Map<string, string>()
  for (const w of clip.walls) {
    const id = uid()
    wallMap.set(w.id, id)
    plan.walls.push({ ...w, id, a: add(w.a, offset), b: add(w.b, offset) })
    out.push({ kind: 'wall', id })
  }
  for (const o of clip.openings) {
    const copiedWall = wallMap.get(o.wallId)
    if (!copiedWall && !plan.walls.some((w) => w.id === o.wallId)) continue
    const id = uid()
    plan.openings.push(copiedWall ? { ...o, id, wallId: copiedWall } : { ...o, id, offset: o.offset + o.width + 10 })
    if (!copiedWall) out.push({ kind: 'opening', id })
  }
  for (const it of clip.items) {
    const id = uid()
    plan.items.push({ ...it, id, x: it.x + offset.x, y: it.y + offset.y })
    out.push({ kind: 'item', id })
  }
  for (const l of clip.roomLabels) {
    const id = uid()
    plan.roomLabels.push({ ...l, id, point: add(l.point, offset) })
    out.push({ kind: 'label', id })
  }
  for (const d of clip.dimensions) {
    const id = uid()
    plan.dimensions.push({ ...d, id, a: add(d.a, offset), b: add(d.b, offset) })
    out.push({ kind: 'dimension', id })
  }
  clampOpenings(plan)
  return out
}

/** Copies the selection with an offset and returns the new selection. */
export function duplicateSelection(plan: Plan, sel: SelectionRef[], offset: Pt): SelectionRef[] {
  return pasteClip(plan, copySelection(plan, sel), offset)
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

/** The selected entities that can be locked: items and walls. */
function lockables(plan: Plan, sel: SelectionRef[]): { locked?: boolean }[] {
  const itemIds = ids(sel, 'item')
  const wallIds = ids(sel, 'wall')
  return [...plan.items.filter((i) => itemIds.has(i.id)), ...plan.walls.filter((w) => wallIds.has(w.id))]
}

/** True when the selection has items or walls and all of them are locked. */
export function allLocked(plan: Plan, sel: SelectionRef[]) {
  const all = lockables(plan, sel)
  return all.length > 0 && all.every((x) => x.locked)
}

/** Locks the selected items and walls, or unlocks them if all are already locked. */
export function toggleLock(plan: Plan, sel: SelectionRef[]) {
  const unlock = allLocked(plan, sel)
  for (const x of lockables(plan, sel)) {
    if (unlock) delete x.locked
    else x.locked = true
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
