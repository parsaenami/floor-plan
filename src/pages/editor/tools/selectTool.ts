import type { Plan, Pt, SelectionRef } from '../../../model/types'
import { moveJoint, translateSelection } from '../../../model/ops'
import { bboxOf, dist, rotate, round, sub } from '../../../geometry/vec'
import {
  bulgeForSweep,
  bulgeThrough,
  clampOpeningOffset,
  closestOnWall,
  endpointsAt,
  nearestWall,
  wallCenterline,
  wallLength,
  wallPolygon,
} from '../../../geometry/walls'
import { itemCorners, itemSize, type DefMap } from '../../../render/planGeometry'
import { useEditor } from '../../../store/editorStore'
import type { Handle, PointerInfo, Tool, ToolContext } from './types'

type Drag =
  | { type: 'move'; start: Pt; moved: boolean }
  | { type: 'opening'; id: string; start: Pt; moved: boolean }
  | { type: 'handle'; handle: Handle; start: Pt }
  | { type: 'marquee'; start: Pt; additive: boolean }

const same = (a: SelectionRef, b: SelectionRef) => a.kind === b.kind && a.id === b.id

export function selectTool(ctx: ToolContext, getDefs: () => DefMap): Tool {
  let drag: Drag | null = null
  const st = () => useEditor.getState()

  function startHandle(e: PointerInfo, handle: Handle) {
    if (handle.type.startsWith('item') && st().plan?.items.find((i) => i.id === handle.id)?.locked) return
    st().begin()
    drag = { type: 'handle', handle, start: e.raw }
  }

  function dragHandle(e: PointerInfo, h: Handle) {
    const base = st().txBase!
    const snapOn = base.settings.snap && !e.alt
    if (h.type === 'wall-end') {
      const wall = base.walls.find((w) => w.id === h.id)
      if (!wall) return
      const from = wall[h.end]
      const other = h.end === 'a' ? wall.b : wall.a
      const connected = new Set(endpointsAt(base.walls, from).map((c) => c.wallId))
      const s = ctx.snap(e.raw, { from: other, angleLock: !e.shift, exclude: connected }, e.alt)
      st().update((p) => moveJoint(p, from, s.p))
      return
    }
    if (h.type === 'wall-bend') {
      const wall = base.walls.find((w) => w.id === h.id)
      if (!wall) return
      const sweep = (4 * Math.atan(bulgeThrough(wall.a, wall.b, e.raw)) * 180) / Math.PI
      const limited = Math.max(-330, Math.min(330, sweep))
      // Snap to 15° steps, so it clicks into straight, quarter and half circles.
      const snapped = snapOn ? round(limited, 15) : limited
      st().update((p) => {
        const w = p.walls.find((x) => x.id === h.id)!
        const b = bulgeForSweep(snapped)
        if (Math.abs(b) < 1e-4) delete w.bulge
        else w.bulge = b
        // Re-clamp openings to the new length.
        for (const o of p.openings) if (o.wallId === w.id) o.offset = clampOpeningOffset(w, o.width, o.offset)
      })
      return
    }
    if (h.type === 'dim-end') {
      const s = ctx.snap(e.raw, {}, e.alt)
      st().update((p) => {
        const d = p.dimensions.find((x) => x.id === h.id)
        if (d) d[h.end] = s.p
      })
      return
    }
    const item = base.items.find((i) => i.id === h.id)
    if (!item) return
    const center = { x: item.x, y: item.y }
    if (h.type === 'item-rotate') {
      const a = (Math.atan2(e.raw.y - center.y, e.raw.x - center.x) * 180) / Math.PI + 90
      const deg = e.shift ? Math.round(a) : round(a, 15)
      st().update((p) => {
        const it = p.items.find((i) => i.id === h.id)!
        it.rotation = ((((deg + 180) % 360) + 360) % 360) - 180
      })
      return
    }
    // Resize in the item's local frame, keeping the opposite edge fixed.
    const { w, d } = itemSize(item, getDefs().get(item.defId))
    const local = rotate(sub(e.raw, center), -item.rotation)
    const step = snapOn ? 5 : 1
    const resizeAxis = (s: number, size: number, pos: number) => {
      if (s === 0) return { size, c: 0 }
      const anchor = (-s * size) / 2
      const next = Math.max(5, round(s * (pos - anchor), step))
      return { size: next, c: anchor + (s * next) / 2 }
    }
    const rx = resizeAxis(h.sx, w, local.x)
    const ry = resizeAxis(h.sy, d, local.y)
    const shift = rotate({ x: rx.c, y: ry.c }, item.rotation)
    st().update((p) => {
      const it = p.items.find((i) => i.id === h.id)!
      it.w = rx.size
      it.d = ry.size
      it.x = center.x + shift.x
      it.y = center.y + shift.y
    })
  }

  function dragOpening(e: PointerInfo, id: string) {
    const base = st().txBase!
    const o = base.openings.find((x) => x.id === id)
    if (!o) return
    // Stay on the current wall unless the pointer is clearly over another one.
    const host = base.walls.find((w) => w.id === o.wallId)
    const near = nearestWall(base.walls, e.raw, 30 / ctx.zoom())
    const wall = near && (!host || near.wall.id !== host.id) && near.d < 20 / ctx.zoom() + near.wall.thickness / 2 ? near.wall : host
    if (!wall) return
    const along = closestOnWall(e.raw, wall).s
    const snapped = base.settings.snap && !e.alt ? round(along, 5) : along
    st().update((p) => {
      const op = p.openings.find((x) => x.id === id)!
      op.wallId = wall.id
      op.width = Math.min(op.width, wallLength(wall))
      op.offset = clampOpeningOffset(wall, op.width, snapped)
    })
  }

  function finishMarquee(a: Pt, b: Pt, additive: boolean) {
    const plan = st().plan!
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    const inside = (pts: Pt[]) => {
      const bb = bboxOf(pts)!
      return bb.minX >= minX && bb.maxX <= maxX && bb.minY >= minY && bb.maxY <= maxY
    }
    const picked = marqueePick(plan, getDefs(), inside)
    const current = additive ? st().selection : []
    st().setSelection([...current, ...picked.filter((p) => !current.some((c) => same(c, p)))])
  }

  return {
    cursor: 'default',
    down(e) {
      if (e.button !== 0) return
      if (e.handle) return startHandle(e, e.handle)
      const target = e.target
      if (target) {
        const sel = st().selection
        const already = sel.some((s) => same(s, target))
        if (e.shift) {
          st().setSelection(already ? sel.filter((s) => !same(s, target)) : [...sel, target])
          return
        }
        if (!already) st().setSelection([target])
        st().begin()
        const onlyOpening = target.kind === 'opening' && (already ? sel.length === 1 : true)
        drag = onlyOpening ? { type: 'opening', id: target.id, start: e.raw, moved: false } : { type: 'move', start: e.raw, moved: false }
        return
      }
      if (!e.shift) st().setSelection([])
      drag = { type: 'marquee', start: e.raw, additive: e.shift }
    },
    move(e) {
      if (!drag) return
      if (drag.type === 'marquee') {
        ctx.setPreview({ kind: 'marquee', a: drag.start, b: e.raw })
        return
      }
      if (drag.type === 'handle') return dragHandle(e, drag.handle)
      if (!drag.moved && dist(drag.start, e.raw) * ctx.zoom() < 3) return
      drag.moved = true
      if (drag.type === 'opening') return dragOpening(e, drag.id)
      const plan = st().txBase!
      const step = plan.settings.snap && !e.alt ? plan.settings.gridSize / 2 : 1
      let delta = { x: round(e.raw.x - drag.start.x, step), y: round(e.raw.y - drag.start.y, step) }
      if (e.shift) delta = Math.abs(delta.x) > Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y }
      const sel = st().selection
      st().update((p) => translateSelection(p, sel, delta))
    },
    up(e) {
      if (!drag) return
      if (drag.type === 'marquee') {
        ctx.setPreview(null)
        if (dist(drag.start, e.raw) * ctx.zoom() > 3) finishMarquee(drag.start, e.raw, drag.additive)
      } else {
        st().end()
      }
      drag = null
    },
    key(e) {
      if (e.key === 'Escape' && drag) {
        if (drag.type !== 'marquee') st().cancel()
        drag = null
        ctx.setPreview(null)
        return true
      }
      return false
    },
    cancel() {
      if (drag && drag.type !== 'marquee') st().end()
      drag = null
      ctx.setPreview(null)
    },
  }
}

export function marqueePick(plan: Plan, defs: DefMap, inside: (pts: Pt[]) => boolean): SelectionRef[] {
  const out: SelectionRef[] = []
  for (const w of plan.walls) if (inside(wallCenterline(w))) out.push({ kind: 'wall', id: w.id })
  for (const it of plan.items) {
    const { w, d } = itemSize(it, defs.get(it.defId))
    if (inside(itemCorners(it, w, d))) out.push({ kind: 'item', id: it.id })
  }
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wallId)
    if (w && inside(wallPolygon(w, o.offset - o.width / 2, o.offset + o.width / 2))) out.push({ kind: 'opening', id: o.id })
  }
  for (const l of plan.roomLabels) if (inside([l.point])) out.push({ kind: 'label', id: l.id })
  for (const d of plan.dimensions) if (inside([d.a, d.b])) out.push({ kind: 'dimension', id: d.id })
  return out
}
