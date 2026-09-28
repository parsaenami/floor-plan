import {
  ArrowDown,
  ArrowUp,
  Brush,
  ChartPie,
  Circle,
  Copy,
  Eraser,
  Magnet,
  Maximize2,
  MousePointer2,
  Pentagon,
  Rainbow,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  Waypoints,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Pt } from '../../model/types'
import { dist, round } from '../../geometry/vec'
import { lockAngle } from '../../geometry/snap'
import { DimLine } from '../../render/DimLine'
import { Primitives } from '../../render/Primitives'
import type { ArcClose, Fill, Primitive } from '../../symbols/primitives'
import { usePlanColors } from '../../theme/themes'
import { Field, NumberInput, Segmented } from '../../ui'
import {
  SWEEP_NAMES,
  handlesOf,
  moveHandle,
  shapesBounds,
  simplify,
  snapTargets,
  translatePrim,
  unwrapSweep,
  type HandleId,
} from './shapeOps'

type ToolId = 'select' | 'line' | 'poly' | 'polygon' | 'rect' | 'ellipse' | 'arc' | 'sector' | 'free' | 'text'

const TOOLS: { id: ToolId; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select and move', key: 'V', icon: <MousePointer2 size={15} /> },
  { id: 'line', label: 'Line', key: 'L', icon: <Slash size={15} /> },
  { id: 'poly', label: 'Polyline', key: 'P', icon: <Waypoints size={15} /> },
  { id: 'polygon', label: 'Polygon', key: 'G', icon: <Pentagon size={15} /> },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: <Square size={15} /> },
  { id: 'ellipse', label: 'Ellipse (⇧ for circle)', key: 'E', icon: <Circle size={15} /> },
  { id: 'arc', label: 'Arc: centre, start, sweep', key: 'A', icon: <Rainbow size={15} /> },
  { id: 'sector', label: 'Pie slice: centre, start, sweep', key: 'S', icon: <ChartPie size={15} /> },
  { id: 'free', label: 'Freehand', key: 'F', icon: <Brush size={15} /> },
  { id: 'text', label: 'Text', key: 'T', icon: <Type size={15} /> },
]

const HINTS: Record<ToolId, string> = {
  select: 'Click a shape to select it, drag to move, drag its handles to reshape',
  line: 'Drag from start to end · ⇧ locks to 15°',
  poly: 'Click each point · double-click or Enter to finish',
  polygon: 'Click each point · click the first point, double-click or Enter to close',
  rect: 'Drag corner to corner · ⇧ for a square',
  ellipse: 'Drag its bounding box · ⇧ for a circle',
  arc: 'Click the centre, click the start, then sweep · snaps to quarter and half circles',
  sector: 'Click the centre, click the start, then sweep · makes a closed slice',
  free: 'Drag to draw · end near the start to close the shape',
  text: 'Click to place a label',
}

interface Style {
  fill: Fill
  dash: boolean
  weight: number
}

type Draft =
  | { t: 'drag'; kind: 'line' | 'rect' | 'ellipse'; a: Pt; b: Pt }
  | { t: 'points'; closed: boolean; pts: Pt[]; cursor: Pt }
  | { t: 'arc'; close?: ArcClose; c: Pt; cursor: Pt; r?: number; a0?: number; sweep: number }
  | { t: 'free'; pts: Pt[] }

type Drag = { t: 'move'; idx: number; start: Pt; base: Primitive[] } | { t: 'handle'; idx: number; id: HandleId; base: Primitive[] }

const isClosed = (p: Primitive) => p.t === 'rect' || p.t === 'ellipse' || (p.t === 'poly' && !!p.closed) || (p.t === 'arc' && !!p.close)
const angleOf = (p: Pt, c: Pt) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
const normDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180

interface Props {
  width: number
  depth: number
  shapes: Primitive[]
  onChange: (shapes: Primitive[]) => void
  /** Resize the component box to the drawing, with shapes moved to start at 0,0. */
  onFit: (w: number, d: number, shapes: Primitive[]) => void
}

/** Draw a component symbol freely: lines, polygons, arcs, pie slices, freehand strokes and text. */
export function ShapeDesigner({ width: w, depth: d, shapes, onChange, onFit }: Props) {
  const colors = usePlanColors()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 600, h: 440 })
  const [tool, setTool] = useState<ToolId>('select')
  const [sel, setSel] = useState<number | null>(null)
  const [draftState, setDraftState] = useState<Draft | null>(null)
  // Pointer events can arrive faster than React re-renders, so handlers read
  // the draft from a ref that is updated synchronously.
  const draftRef = useRef<Draft | null>(null)
  const setDraft = (d: Draft | null) => {
    draftRef.current = d
    setDraftState(d)
  }
  const [snapOn, setSnapOn] = useState(true)
  const [style, setStyle] = useState<Style>({ fill: 'paper', dash: false, weight: 1 })
  const [focusText, setFocusText] = useState(0)
  const drag = useRef<Drag | null>(null)
  const history = useRef<{ past: Primitive[][]; future: Primitive[][] }>({ past: [], future: [] })
  const shapesRef = useRef(shapes)
  shapesRef.current = shapes

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Selection indexes go stale when shapes change from outside (undo, symbol switch).
  useEffect(() => {
    if (sel !== null && sel >= shapes.length) setSel(null)
  }, [shapes.length, sel])

  const pad = Math.max(w, d) * 0.18 + 10
  const vb = { x: -pad, y: -pad, w: w + pad * 2, h: d + pad * 2 }
  const unit = Math.max(vb.w / (size.w || 1), vb.h / (size.h || 1))
  const grid = Math.max(w, d) > 400 ? 10 : 5

  /* ---------- History ---------- */
  const commit = (next: Primitive[], base = shapesRef.current) => {
    history.current.past.push(base)
    history.current.future = []
    onChange(next)
  }
  const undo = () => {
    const h = history.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.unshift(shapesRef.current)
    onChange(prev)
    setSel(null)
  }
  const redo = () => {
    const h = history.current
    const next = h.future.shift()
    if (!next) return
    h.past.push(shapesRef.current)
    onChange(next)
    setSel(null)
  }

  /* ---------- Coordinates & snapping ---------- */
  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  const snap = (raw: Pt, o: { alt?: boolean; from?: Pt; lock?: boolean; skip?: number } = {}): Pt => {
    let p = raw
    if (o.from && o.lock) p = lockAngle(o.from, p, 15)
    if (!snapOn || o.alt) return p
    const targets: Pt[] = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
      { x: w / 2, y: 0 },
      { x: w, y: d / 2 },
      { x: w / 2, y: d },
      { x: 0, y: d / 2 },
      { x: w / 2, y: d / 2 },
    ]
    shapesRef.current.forEach((s, i) => i !== o.skip && targets.push(...snapTargets(s)))
    let best: Pt | null = null
    let bestD = 8 * unit
    for (const t of targets) {
      const dd = dist(t, p)
      if (dd < bestD) {
        bestD = dd
        best = t
      }
    }
    if (best) return best
    if (o.from && o.lock) return p
    return { x: round(p.x, grid), y: round(p.y, grid) }
  }

  const withStyle = <T extends Primitive>(p: T): T => ({
    ...p,
    dash: style.dash || undefined,
    weight: style.weight === 1 ? undefined : style.weight,
    ...(isClosed(p) ? { fill: style.fill } : {}),
  })

  const add = (p: Primitive) => {
    commit([...shapesRef.current, withStyle(p)])
    setSel(shapesRef.current.length)
  }

  const finishPoints = (closedOverride?: boolean) => {
    const draft = draftRef.current
    if (draft?.t !== 'points') return
    // A double-click leaves a duplicate last point behind.
    const pts = draft.pts.filter((p, i, all) => i === 0 || dist(p, all[i - 1]) > 0.01)
    const closed = closedOverride ?? draft.closed
    setDraft(null)
    if (pts.length < 2 || (closed && pts.length < 3)) return
    add({ t: 'poly', pts: pts.map((p) => [p.x, p.y]), closed })
  }

  /* ---------- Pointer ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    const draft = draftRef.current
    if (e.button !== 0) return
    // No compatibility mousedown: it would pull focus back from a field we focus (new text).
    e.preventDefault()
    wrapRef.current?.focus()
    svgRef.current?.setPointerCapture(e.pointerId)
    const raw = toWorld(e)
    const target = e.target as Element
    switch (tool) {
      case 'select': {
        const h = target.closest('[data-h]') as SVGElement | null
        if (h && sel !== null) {
          drag.current = { t: 'handle', idx: sel, id: h.dataset.h!, base: shapesRef.current }
          return
        }
        const hit = target.closest('[data-idx]') as SVGElement | null
        if (hit) {
          const idx = Number(hit.dataset.idx)
          setSel(idx)
          drag.current = { t: 'move', idx, start: raw, base: shapesRef.current }
        } else setSel(null)
        return
      }
      case 'line':
      case 'rect':
      case 'ellipse': {
        const a = snap(raw, { alt: e.altKey })
        setDraft({ t: 'drag', kind: tool, a, b: a })
        return
      }
      case 'free':
        setDraft({ t: 'free', pts: [raw] })
        return
      case 'poly':
      case 'polygon': {
        const last = draft?.t === 'points' ? draft.pts[draft.pts.length - 1] : undefined
        const q = snap(raw, { alt: e.altKey, from: last, lock: e.shiftKey })
        if (draft?.t !== 'points') return setDraft({ t: 'points', closed: tool === 'polygon', pts: [q], cursor: q })
        if (e.detail >= 2) return finishPoints()
        if (draft.pts.length >= 3 && dist(q, draft.pts[0]) < 8 * unit) return finishPoints(true)
        setDraft({ ...draft, pts: [...draft.pts, q], cursor: q })
        return
      }
      case 'arc':
      case 'sector': {
        const q = snap(raw, { alt: e.altKey })
        if (draft?.t !== 'arc') return setDraft({ t: 'arc', close: tool === 'sector' ? 'sector' : undefined, c: q, cursor: q, sweep: 0 })
        if (draft.r === undefined) {
          const r = dist(draft.c, q)
          if (r < 1) return
          const a = angleOf(q, draft.c)
          setDraft({ ...draft, r, a0: snapOn && !e.altKey ? round(a, 15) : a, cursor: q })
          return
        }
        if (Math.abs(draft.sweep) < 1) return
        setDraft(null)
        add({ t: 'arc', cx: draft.c.x, cy: draft.c.y, r: draft.r, a0: draft.a0!, a1: draft.a0! + draft.sweep, close: draft.close })
        return
      }
      case 'text': {
        const p = snap(raw, { alt: e.altKey })
        add({ t: 'text', x: p.x, y: p.y, text: 'Label' })
        setTool('select')
        setFocusText((n) => n + 1)
        return
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const draft = draftRef.current
    const raw = toWorld(e)
    const dr = drag.current
    if (dr) {
      const cur = dr.base[dr.idx]
      if (!cur) return
      if (dr.t === 'handle') {
        const p = snap(raw, { alt: e.altKey, skip: dr.idx })
        onChange(dr.base.map((s, i) => (i === dr.idx ? moveHandle(cur, dr.id, p) : s)))
      } else {
        let dx = raw.x - dr.start.x
        let dy = raw.y - dr.start.y
        if (snapOn && !e.altKey) {
          dx = round(dx, grid)
          dy = round(dy, grid)
        }
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0)
        onChange(dr.base.map((s, i) => (i === dr.idx ? translatePrim(cur, dx, dy) : s)))
      }
      return
    }
    if (!draft) return
    switch (draft.t) {
      case 'drag': {
        let b = snap(raw, { alt: e.altKey, from: draft.a, lock: e.shiftKey && draft.kind === 'line' })
        if (e.shiftKey && draft.kind !== 'line') {
          const s = Math.max(Math.abs(b.x - draft.a.x), Math.abs(b.y - draft.a.y))
          b = { x: draft.a.x + s * Math.sign(b.x - draft.a.x || 1), y: draft.a.y + s * Math.sign(b.y - draft.a.y || 1) }
        }
        setDraft({ ...draft, b })
        return
      }
      case 'free': {
        const last = draft.pts[draft.pts.length - 1]
        if (dist(last, raw) > unit * 2) setDraft({ ...draft, pts: [...draft.pts, raw] })
        return
      }
      case 'points': {
        const last = draft.pts[draft.pts.length - 1]
        setDraft({ ...draft, cursor: snap(raw, { alt: e.altKey, from: last, lock: e.shiftKey }) })
        return
      }
      case 'arc': {
        if (draft.r === undefined) return setDraft({ ...draft, cursor: snap(raw, { alt: e.altKey }) })
        const delta = normDeg(angleOf(raw, draft.c) - draft.a0!)
        let sweep = unwrapSweep(delta, draft.sweep)
        if (snapOn && !e.altKey) sweep = round(sweep, 15)
        setDraft({ ...draft, sweep, cursor: raw })
        return
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const draft = draftRef.current
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    const dr = drag.current
    if (dr) {
      drag.current = null
      if (shapesRef.current !== dr.base) history.current.past.push(dr.base)
      return
    }
    if (draft?.t === 'drag') {
      const { a, b, kind } = draft
      setDraft(null)
      if (dist(a, b) < 1) return
      if (kind === 'line') add({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      if (kind === 'rect') add({ t: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })
      if (kind === 'ellipse')
        add({ t: 'ellipse', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(a.x - b.x) / 2, ry: Math.abs(a.y - b.y) / 2 })
    }
    if (draft?.t === 'free') {
      setDraft(null)
      const pts = simplify(draft.pts, Math.max(0.5, unit * 1.5))
      if (pts.length < 2) return
      const closed = pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 10 * unit
      add({ t: 'poly', pts: (closed ? pts.slice(0, -1) : pts).map((p) => [p.x, p.y]), closed })
    }
  }

  /* ---------- Keyboard ---------- */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const draft = draftRef.current
    const t = e.target as HTMLElement
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    let action: (() => void) | null = null
    if (mod && key === 'z') action = e.shiftKey ? redo : undo
    else if (mod && key === 'd' && sel !== null) action = duplicate
    else if (mod) return
    else if (e.key === 'Enter' && draft?.t === 'points') action = () => finishPoints()
    else if (e.key === 'Escape')
      action = () => {
        if (draft?.t === 'points') finishPoints()
        else if (draft) setDraft(null)
        else setSel(null)
      }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) action = remove
    else {
      const tl = TOOLS.find((x) => x.key.toLowerCase() === key)
      if (tl)
        action = () => {
          setDraft(null)
          setTool(tl.id)
        }
    }
    if (!action) return
    // Keep the editor page's own shortcuts from seeing keys used here.
    e.preventDefault()
    e.stopPropagation()
    action()
  }

  /* ---------- Selected shape edits ---------- */
  const selected = sel !== null ? shapes[sel] : undefined
  const edit = (next: Primitive) => sel !== null && commit(shapes.map((s, i) => (i === sel ? next : s)))
  const remove = () => {
    if (sel === null) return
    commit(shapes.filter((_, i) => i !== sel))
    setSel(null)
  }
  const duplicate = () => {
    if (!selected) return
    commit([...shapes, translatePrim(selected, grid * 2, grid * 2)])
    setSel(shapes.length)
  }
  const restack = (up: boolean) => {
    if (sel === null) return
    const j = up ? sel + 1 : sel - 1
    if (j < 0 || j >= shapes.length) return
    const next = [...shapes]
    ;[next[sel], next[j]] = [next[j], next[sel]]
    commit(next)
    setSel(j)
  }
  const shownStyle: Style = selected
    ? { fill: ('fill' in selected && selected.fill) || 'none', dash: 'dash' in selected && !!selected.dash, weight: ('weight' in selected && selected.weight) || 1 }
    : style
  const setShownStyle = (patch: Partial<Style>) => {
    setStyle((s) => ({ ...s, ...patch }))
    if (!selected || selected.t === 'text') return
    const next = { ...selected } as Primitive & { fill?: Fill; dash?: boolean; weight?: number }
    if (patch.fill !== undefined && isClosed(selected)) next.fill = patch.fill
    if (patch.dash !== undefined) next.dash = patch.dash || undefined
    if (patch.weight !== undefined) next.weight = patch.weight === 1 ? undefined : patch.weight
    edit(next)
  }

  const fit = () => {
    const bb = shapesBounds(shapes)
    if (!bb) return
    const nw = Math.max(5, Math.ceil(bb.maxX - bb.minX))
    const nd = Math.max(5, Math.ceil(bb.maxY - bb.minY))
    onFit(nw, nd, shapes.map((s) => translatePrim(s, -bb.minX, -bb.minY)))
    history.current = { past: [], future: [] }
  }

  /* ---------- Render ---------- */
  const handleSize = 7 * unit
  const bb = selected ? shapesBounds([selected]) : null
  const showMinor = grid / unit >= 6

  return (
    <div className="designer" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="designer-tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tool-btn"
            aria-pressed={tool === t.id}
            title={`${t.label} (${t.key})`}
            onClick={() => {
              setDraft(null)
              setTool(t.id)
            }}
          >
            {t.icon}
            <span className="tool-key mono">{t.key}</span>
          </button>
        ))}
        <div className="vr" />
        <button type="button" className="icon-btn" aria-pressed={snapOn} title="Snap to grid and points (hold ⌥ to override)" onClick={() => setSnapOn(!snapOn)}>
          <Magnet size={15} />
        </button>
        <button type="button" className="icon-btn" title="Undo (⌘Z)" onClick={undo}>
          <Undo2 size={15} />
        </button>
        <button type="button" className="icon-btn" title="Redo (⇧⌘Z)" onClick={redo}>
          <Redo2 size={15} />
        </button>
        <div className="spacer" />
        <button type="button" className="btn sm ghost" title="Resize the component to fit the drawing" disabled={!shapes.length} onClick={fit}>
          <Maximize2 size={13} /> Fit size
        </button>
        <button
          type="button"
          className="btn sm ghost"
          title="Remove every shape"
          disabled={!shapes.length}
          onClick={() => {
            commit([])
            setSel(null)
          }}
        >
          <Eraser size={13} /> Clear
        </button>
      </div>

      <svg
        ref={svgRef}
        className="designer-canvas"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => draftRef.current?.t === 'points' && finishPoints()}
      >
        <defs>
          <pattern id="dz-minor" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke={colors.gridMinor} strokeWidth={unit} />
          </pattern>
          <pattern id="dz-major" width={grid * 10} height={grid * 10} patternUnits="userSpaceOnUse">
            <path d={`M ${grid * 10} 0 L 0 0 0 ${grid * 10}`} fill="none" stroke={colors.gridMajor} strokeWidth={unit} />
          </pattern>
        </defs>
        <g pointerEvents="none">
          {showMinor && <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#dz-minor)" />}
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#dz-major)" />
          <rect x={0} y={0} width={w} height={d} fill="none" stroke={colors.muted} strokeWidth={unit} strokeDasharray={`${unit * 5} ${unit * 4}`} />
          <DimLine a={{ x: 0, y: 0 }} b={{ x: w, y: 0 }} offset={14 * unit} unit={unit} extensions />
          <DimLine a={{ x: 0, y: d }} b={{ x: 0, y: 0 }} offset={14 * unit} unit={unit} extensions />
        </g>

        {shapes.map((p, i) => (
          <g key={i} data-idx={i}>
            <Primitives prims={[p]} unit={unit} />
            <g
              className="designer-hit"
              data-open={isClosed(p) || p.t === 'text' ? undefined : ''}
              style={{ '--hit': `${8 * unit}px` } as React.CSSProperties}
            >
              <Primitives prims={[p]} unit={unit} />
            </g>
          </g>
        ))}

        {selected && bb && (
          <g>
            <rect
              x={bb.minX - 3 * unit}
              y={bb.minY - 3 * unit}
              width={bb.maxX - bb.minX + 6 * unit}
              height={bb.maxY - bb.minY + 6 * unit}
              fill="none"
              stroke={colors.ink}
              strokeWidth={unit}
              strokeDasharray={`${unit * 4} ${unit * 3}`}
              pointerEvents="none"
            />
            {tool === 'select' &&
              handlesOf(selected).map((h) => (
                <rect
                  key={h.id}
                  data-h={h.id}
                  x={h.p.x - handleSize / 2}
                  y={h.p.y - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill={colors.paper}
                  stroke={colors.ink}
                  strokeWidth={unit}
                  style={{ cursor: 'move' }}
                />
              ))}
          </g>
        )}

        <DraftPreview draft={draftState} unit={unit} style={style} />
      </svg>

      <div className="designer-bar">
        <span className="designer-hint mono">
          {draftState?.t === 'arc' && draftState.r !== undefined ? sweepLabel(draftState.sweep) : HINTS[tool]}
        </span>
        <div className="designer-style">
          <Field label="Fill">
            <Segmented<Fill>
              value={shownStyle.fill}
              onChange={(fill) => setShownStyle({ fill })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'paper', label: 'Paper' },
                { value: 'ink', label: 'Ink' },
              ]}
            />
          </Field>
          <Field label="Line">
            <Segmented
              value={shownStyle.dash ? 'dash' : 'solid'}
              onChange={(v) => setShownStyle({ dash: v === 'dash' })}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dash', label: 'Dashed' },
              ]}
            />
          </Field>
          <Field label="Weight">
            <Segmented
              value={String(shownStyle.weight)}
              onChange={(v) => setShownStyle({ weight: Number(v) })}
              options={['1', '1.5', '2', '3'].map((v) => ({ value: v, label: v }))}
            />
          </Field>
        </div>
        {selected && (
          <div className="designer-selected">
            <ShapeFields shape={selected} onEdit={edit} focusText={focusText} />
            <div className="designer-actions">
              <button type="button" className="btn sm" title="Bring forward" disabled={sel === shapes.length - 1} onClick={() => restack(true)}>
                <ArrowUp size={13} />
              </button>
              <button type="button" className="btn sm" title="Send backward" disabled={sel === 0} onClick={() => restack(false)}>
                <ArrowDown size={13} />
              </button>
              <button type="button" className="btn sm" title="Duplicate (⌘D)" onClick={duplicate}>
                <Copy size={13} />
              </button>
              <button type="button" className="btn sm" title="Delete (⌫)" onClick={remove}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function sweepLabel(sweep: number) {
  const a = Math.round(Math.abs(sweep))
  return `${a}°${SWEEP_NAMES[a] ? ` · ${SWEEP_NAMES[a]}` : ''} · click to place`
}

/** Numeric fields for the selected shape. */
function ShapeFields({ shape: p, onEdit, focusText }: { shape: Primitive; onEdit: (p: Primitive) => void; focusText: number }) {
  switch (p.t) {
    case 'text':
      return (
        <div className="designer-fields">
          <Field label="Text">
            <input
              key={focusText}
              className="input"
              autoFocus={focusText > 0}
              defaultValue={p.text}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => e.target.value !== p.text && onEdit({ ...p, text: e.target.value || 'Label' })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </Field>
          <Field label="Size">
            <NumberInput value={p.size ?? 1} min={0.4} max={4} step={0.1} precision={1} onChange={(size) => onEdit({ ...p, size })} />
          </Field>
        </div>
      )
    case 'arc': {
      const sweep = p.a1 - p.a0
      const sign = Math.sign(sweep) || 1
      return (
        <div className="designer-fields">
          <Field label="Radius">
            <NumberInput value={p.r} min={1} suffix="cm" onChange={(r) => onEdit({ ...p, r })} />
          </Field>
          <Field label="Start">
            <NumberInput value={p.a0} step={15} suffix="°" onChange={(a0) => onEdit({ ...p, a0, a1: a0 + sweep })} />
          </Field>
          <Field label="Sweep">
            <NumberInput value={sweep} min={-360} max={360} step={15} suffix="°" onChange={(s) => onEdit({ ...p, a1: p.a0 + s })} />
          </Field>
          <Field label="Preset">
            <Segmented
              value={String(Math.abs(Math.round(sweep)))}
              onChange={(v) => onEdit({ ...p, a1: p.a0 + sign * Number(v) })}
              options={[
                { value: '90', label: '¼' },
                { value: '180', label: '½' },
                { value: '270', label: '¾' },
                { value: '360', label: '○' },
              ]}
            />
          </Field>
          <Field label="Shape">
            <Segmented
              value={p.close ?? 'open'}
              onChange={(v) => onEdit({ ...p, close: v === 'open' ? undefined : (v as ArcClose), fill: v === 'open' ? undefined : (p.fill ?? 'paper') })}
              options={[
                { value: 'open', label: 'Arc' },
                { value: 'sector', label: 'Slice' },
                { value: 'chord', label: 'Chord' },
              ]}
            />
          </Field>
        </div>
      )
    }
    case 'rect':
      return (
        <div className="designer-fields">
          <Field label="W">
            <NumberInput value={p.w} min={1} suffix="cm" onChange={(v) => onEdit({ ...p, w: v })} />
          </Field>
          <Field label="H">
            <NumberInput value={p.h} min={1} suffix="cm" onChange={(v) => onEdit({ ...p, h: v })} />
          </Field>
          <Field label="Corner">
            <NumberInput value={p.r ?? 0} min={0} suffix="cm" onChange={(v) => onEdit({ ...p, r: v || undefined })} />
          </Field>
        </div>
      )
    case 'ellipse':
      return (
        <div className="designer-fields">
          <Field label="W">
            <NumberInput value={p.rx * 2} min={1} suffix="cm" onChange={(v) => onEdit({ ...p, rx: v / 2 })} />
          </Field>
          <Field label="H">
            <NumberInput value={p.ry * 2} min={1} suffix="cm" onChange={(v) => onEdit({ ...p, ry: v / 2 })} />
          </Field>
        </div>
      )
    case 'poly':
      return (
        <div className="designer-fields">
          <label className="check">
            <input type="checkbox" checked={!!p.closed} onChange={(e) => onEdit({ ...p, closed: e.target.checked, fill: e.target.checked ? (p.fill ?? 'paper') : undefined })} />
            Closed shape
          </label>
        </div>
      )
    case 'line':
      return null
  }
}

function DraftPreview({ draft, unit, style }: { draft: Draft | null; unit: number; style: Style }) {
  const c = usePlanColors()
  if (!draft) return null
  const ghost = { dash: style.dash || undefined, weight: style.weight }
  let prims: Primitive[] = []
  const extra: ReactNode[] = []
  switch (draft.t) {
    case 'drag': {
      const { a, b } = draft
      if (draft.kind === 'line') prims = [{ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...ghost }]
      if (draft.kind === 'rect') prims = [{ t: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), ...ghost }]
      if (draft.kind === 'ellipse')
        prims = [{ t: 'ellipse', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(a.x - b.x) / 2, ry: Math.abs(a.y - b.y) / 2, ...ghost }]
      if (draft.kind !== 'line' && dist(a, b) > 1) {
        extra.push(
          <DimLine key="w" a={{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }} b={{ x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) }} offset={10 * unit} unit={unit} />,
        )
      }
      if (draft.kind === 'line' && dist(a, b) > 1) extra.push(<DimLine key="l" a={a} b={b} offset={10 * unit} unit={unit} />)
      break
    }
    case 'free':
      prims = [{ t: 'poly', pts: draft.pts.map((p) => [p.x, p.y]), ...ghost }]
      break
    case 'points': {
      const pts = [...draft.pts, draft.cursor]
      prims = [{ t: 'poly', pts: pts.map((p) => [p.x, p.y]), closed: false, ...ghost }]
      if (draft.closed && draft.pts.length >= 2)
        extra.push(
          <line
            key="close"
            x1={draft.cursor.x}
            y1={draft.cursor.y}
            x2={draft.pts[0].x}
            y2={draft.pts[0].y}
            stroke={c.ink}
            strokeWidth={unit}
            strokeDasharray={`${unit * 3} ${unit * 3}`}
          />,
        )
      break
    }
    case 'arc': {
      if (draft.r === undefined) {
        const r = dist(draft.c, draft.cursor)
        prims = [{ t: 'ellipse', cx: draft.c.x, cy: draft.c.y, rx: r, ry: r, dash: true }]
        extra.push(<line key="r" x1={draft.c.x} y1={draft.c.y} x2={draft.cursor.x} y2={draft.cursor.y} stroke={c.ink} strokeWidth={unit} />)
      } else {
        const a1 = draft.a0! + draft.sweep
        prims = [
          { t: 'ellipse', cx: draft.c.x, cy: draft.c.y, rx: draft.r, ry: draft.r, dash: true, weight: 0.5 },
          ...(Math.abs(draft.sweep) > 0.5 ? [{ t: 'arc' as const, cx: draft.c.x, cy: draft.c.y, r: draft.r, a0: draft.a0!, a1, close: draft.close, ...ghost }] : []),
        ]
      }
      extra.push(<circle key="c" cx={draft.c.x} cy={draft.c.y} r={2.5 * unit} fill={c.ink} />)
      break
    }
  }
  return (
    <g pointerEvents="none" opacity={0.8}>
      <Primitives prims={prims} unit={unit} />
      {extra}
    </g>
  )
}
