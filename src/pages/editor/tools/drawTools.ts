import type { Pt } from '../../../model/types'
import { DEFAULT_OPENING_WIDTH, uid } from '../../../model/defaults'
import { addWalls, orientWalls } from '../../../model/ops'
import type { SnapKind } from '../../../geometry/snap'
import { eq, dist, round } from '../../../geometry/vec'
import { bulgeForSweep, bulgeThrough, clampOpeningOffset, nearestWall, rectRoomWalls, wallLength } from '../../../geometry/walls'
import { useEditor } from '../../../store/editorStore'
import type { Tool, ToolContext } from './types'

const plan = () => useEditor.getState().plan!

/**
 * Adds one wall of a chain. Every wall drawn so far in the chain is re-oriented,
 * so once the chain encloses a room all of their thickness sits outside it.
 */
function addChainWall(chainIds: string[], a: Pt, b: Pt, bulge?: number) {
  const thickness = plan().settings.defaultWallThickness
  useEditor.getState().commit((p) => {
    const [w] = addWalls(p, [[a, b]], thickness, 'left', bulge)
    if (w) chainIds.push(w.id)
    orientWalls(p, new Set(chainIds))
  })
}

/** Click-to-click wall drawing. Joining an existing wall or the start point ends the chain. */
export function wallTool(ctx: ToolContext): Tool {
  let chain: Pt[] = []
  let ids: string[] = []

  const finish = () => {
    chain = []
    ids = []
    ctx.setPreview(null)
  }

  return {
    cursor: 'crosshair',
    down(e) {
      if (e.button !== 0) return
      const last = chain[chain.length - 1]
      const s = ctx.snap(e.raw, { from: last, angleLock: !e.shift }, e.alt)
      if (!last) {
        chain = [s.p]
        return
      }
      if (eq(last, s.p, 1)) return
      addChainWall(ids, last, s.p)
      const closes = chain.length >= 2 && eq(chain[0], s.p, 1)
      const joins = s.kind === 'endpoint' || s.kind === 'wall'
      if (closes || joins) finish()
      else chain.push(s.p)
    },
    move(e) {
      const last = chain[chain.length - 1]
      const s = ctx.snap(e.raw, { from: last, angleLock: !e.shift }, e.alt)
      ctx.setPreview(last ? { kind: 'wall-chain', points: [...chain], cursor: s.p, snap: s.kind } : { kind: 'cursor', p: s.p, snap: s.kind })
    },
    dblclick: () => finish(),
    key(e) {
      if ((e.key === 'Enter' || e.key === 'Escape') && chain.length) {
        finish()
        return true
      }
      return false
    },
    cancel: finish,
  }
}

/**
 * Curved walls, three clicks each: start, end, then the bulge. The bulge snaps
 * to 15° steps of sweep, so quarter and half circles are easy to hit.
 * Arcs chain end to start like straight walls.
 */
export function arcTool(ctx: ToolContext): Tool {
  let start: Pt | null = null
  let end: { p: Pt; snap: SnapKind } | null = null
  let first: Pt | null = null
  let ids: string[] = []

  const bulgeAt = (raw: Pt, alt: boolean) => {
    const { settings } = plan()
    let b = bulgeThrough(start!, end!.p, raw)
    const sweep = (4 * Math.atan(b) * 180) / Math.PI
    const limited = Math.max(-330, Math.min(330, sweep))
    const snapped = settings.snap && !alt ? round(limited, 15) : limited
    b = bulgeForSweep(snapped)
    return b
  }

  const finish = () => {
    start = end = first = null
    ids = []
    ctx.setPreview(null)
  }

  return {
    cursor: 'crosshair',
    down(e) {
      if (e.button !== 0) return
      if (!start) {
        start = first = ctx.snap(e.raw, {}, e.alt).p
        return
      }
      if (!end) {
        const s = ctx.snap(e.raw, { from: start, angleLock: !e.shift }, e.alt)
        if (!eq(start, s.p, 1)) end = { p: s.p, snap: s.kind }
        return
      }
      const bulge = bulgeAt(e.raw, e.alt)
      addChainWall(ids, start, end.p, bulge || undefined)
      const closes = ids.length >= 2 && first && eq(first, end.p, 1)
      const joins = end.snap === 'endpoint' || end.snap === 'wall'
      if (closes || joins) return finish()
      start = end.p
      end = null
    },
    move(e) {
      if (!start) {
        const s = ctx.snap(e.raw, {}, e.alt)
        return ctx.setPreview({ kind: 'cursor', p: s.p, snap: s.kind })
      }
      if (!end) {
        const s = ctx.snap(e.raw, { from: start, angleLock: !e.shift }, e.alt)
        return ctx.setPreview({ kind: 'arc-wall', a: start, b: s.p, bulge: 0, snap: s.kind })
      }
      ctx.setPreview({ kind: 'arc-wall', a: start, b: end.p, bulge: bulgeAt(e.raw, e.alt), snap: end.snap })
    },
    dblclick: () => finish(),
    key(e) {
      if ((e.key === 'Enter' || e.key === 'Escape') && start) {
        finish()
        return true
      }
      return false
    },
    cancel: finish,
  }
}

/** Drag a rectangle; its edges become the inner faces of four walls, with the thickness outside. */
export function roomTool(ctx: ToolContext): Tool {
  let start: Pt | null = null
  return {
    cursor: 'crosshair',
    down(e) {
      if (e.button !== 0) return
      start = ctx.snap(e.raw, { walls: [] }, e.alt).p
    },
    move(e) {
      const p = ctx.snap(e.raw, { walls: [] }, e.alt).p
      ctx.setPreview(start ? { kind: 'rect', a: start, b: p } : { kind: 'cursor', p, snap: 'grid' })
    },
    up(e) {
      if (!start) return
      const b = ctx.snap(e.raw, { walls: [] }, e.alt).p
      const a = start
      start = null
      ctx.setPreview(null)
      if (Math.abs(a.x - b.x) < 30 || Math.abs(a.y - b.y) < 30) return
      const t = plan().settings.defaultWallThickness
      const labelId = uid()
      useEditor.getState().commit((p) => {
        addWalls(p, rectRoomWalls(a, b), t, 'left')
        p.roomLabels.push({ id: labelId, name: 'Room', point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } })
      })
      useEditor.getState().setSelection([{ kind: 'label', id: labelId }])
    },
    cancel() {
      start = null
      ctx.setPreview(null)
    },
  }
}

/** Hover a wall to preview a door or window, click to place it. */
export function openingTool(ctx: ToolContext): Tool {
  const locate = (raw: Pt, alt: boolean) => {
    const hit = nearestWall(plan().walls, raw, 40 / ctx.zoom())
    if (!hit) return null
    const kind = useEditor.getState().openingKind
    const width = Math.min(DEFAULT_OPENING_WIDTH[kind], wallLength(hit.wall))
    const along = hit.s
    const offset = clampOpeningOffset(hit.wall, width, alt ? along : round(along, 5))
    return { wall: hit.wall, width, offset, kind }
  }
  return {
    cursor: 'copy',
    move(e) {
      const l = locate(e.raw, e.alt)
      ctx.setPreview(l ? { kind: 'opening', wallId: l.wall.id, offset: l.offset, width: l.width, openingKind: l.kind } : null)
    },
    down(e) {
      if (e.button !== 0) return
      const l = locate(e.raw, e.alt)
      if (!l) return
      const id = uid()
      useEditor.getState().commit((p) =>
        void p.openings.push({ id, wallId: l.wall.id, kind: l.kind, offset: l.offset, width: l.width, flipSide: false, flipHinge: false }),
      )
      useEditor.getState().setSelection([{ kind: 'opening', id }])
    },
    cancel: () => ctx.setPreview(null),
  }
}

export function measureTool(ctx: ToolContext): Tool {
  let start: Pt | null = null
  return {
    cursor: 'crosshair',
    down(e) {
      if (e.button !== 0) return
      start = ctx.snap(e.raw, {}, e.alt).p
    },
    move(e) {
      const s = ctx.snap(e.raw, { from: start ?? undefined, angleLock: !!start && !e.shift }, e.alt)
      ctx.setPreview(start ? { kind: 'measure', a: start, b: s.p } : { kind: 'cursor', p: s.p, snap: s.kind })
    },
    up(e) {
      if (!start) return
      const b = ctx.snap(e.raw, { from: start, angleLock: !e.shift }, e.alt).p
      const a = start
      start = null
      ctx.setPreview(null)
      if (dist(a, b) < 5) return
      const id = uid()
      useEditor.getState().commit((p) => void p.dimensions.push({ id, a, b, offset: 30 }))
      useEditor.getState().setSelection([{ kind: 'dimension', id }])
    },
    cancel() {
      start = null
      ctx.setPreview(null)
    },
  }
}

export function labelTool(ctx: ToolContext): Tool {
  return {
    cursor: 'text',
    down(e) {
      if (e.button !== 0) return
      const p = ctx.snap(e.raw, { walls: [] }, e.alt).p
      const id = uid()
      useEditor.getState().commit((pl) => void pl.roomLabels.push({ id, name: 'Room', point: p }))
      useEditor.getState().setSelection([{ kind: 'label', id }])
      useEditor.getState().setTool('select')
    },
  }
}
