import { BringToFront, Copy, FlipVertical2, Maximize, Minus, Plus, RotateCw, SendToBack, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Plan, Pt, SelectionRef } from '../../model/types'
import { uid } from '../../model/defaults'
import { deleteSelection, duplicateSelection, reorderItems, rotateSelection, stackRoom, type ZMove } from '../../model/ops'
import { flipAlign } from '../../geometry/walls'
import { usePlanColors } from '../../theme/themes'
import { detectRooms } from '../../geometry/rooms'
import { snapPoint } from '../../geometry/snap'
import { round } from '../../geometry/vec'
import { PlanLayers } from '../../render/PlanLayers'
import { planBBox, type DefMap } from '../../render/planGeometry'
import { useEditor, type Camera, type ToolId } from '../../store/editorStore'
import { Overlay, PreviewLayer } from './Overlay'
import { useShortcuts } from './shortcuts'
import { arcTool, labelTool, measureTool, openingTool, roomTool, wallTool } from './tools/drawTools'
import { selectTool } from './tools/selectTool'
import type { Handle, PointerInfo, Preview, Tool, ToolContext } from './tools/types'

export const DEF_MIME = 'application/x-floorplan-def'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 12

const HINTS: Record<ToolId, string> = {
  select: 'Drag to move · Shift-click to add · Drag empty space to box-select',
  wall: 'Click to place points · Enter or double-click to finish · Shift frees the angle · Alt disables snapping',
  arc: 'Click start, click end, then click to set the curve · snaps to quarter and half circles · Alt frees it',
  room: 'Drag the room’s inner rectangle · wall thickness goes outside it',
  opening: 'Hover a wall and click to place · F flips the swing',
  measure: 'Drag between two points to add a dimension',
  label: 'Click inside a room to name it',
  pan: 'Drag to pan · Space works in any tool',
}

export function Canvas({ defs }: { defs: DefMap }) {
  const plan = useEditor((s) => s.plan) as Plan
  const camera = useEditor((s) => s.camera)
  const tool = useEditor((s) => s.tool)
  const selection = useEditor((s) => s.selection)
  const setCamera = useEditor((s) => s.setCamera)
  const colors = usePlanColors()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const panRef = useRef<{ screen: Pt; cam: Camera } | null>(null)
  const defsRef = useRef(defs)
  defsRef.current = defs

  const rooms = useMemo(() => detectRooms(plan.walls, plan.roomLabels), [plan.walls, plan.roomLabels])
  const unit = 1 / camera.zoom

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const { plan: p } = useEditor.getState()
    const el = wrapRef.current
    if (!p || !el) return
    const w = el.clientWidth
    const h = el.clientHeight
    const bb = planBBox(p, defsRef.current) ?? { minX: 0, minY: 0, maxX: 600, maxY: 400 }
    const bw = Math.max(200, bb.maxX - bb.minX)
    const bh = Math.max(200, bb.maxY - bb.minY)
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(w / bw, h / bh) * 0.8))
    setCamera({ zoom, x: (bb.minX + bb.maxX) / 2 - w / 2 / zoom, y: (bb.minY + bb.maxY) / 2 - h / 2 / zoom })
  }, [setCamera])

  // Fit once when a plan opens and the viewport has a size.
  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (size.w > 0 && fittedFor.current !== plan.id) {
      fittedFor.current = plan.id
      fit()
    }
  }, [size.w, plan.id, fit])

  const zoomAt = useCallback(
    (screen: Pt, factor: number) => {
      const cam = useEditor.getState().camera
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor))
      const wx = cam.x + screen.x / cam.zoom
      const wy = cam.y + screen.y / cam.zoom
      setCamera({ zoom, x: wx - screen.x / zoom, y: wy - screen.y / zoom })
    },
    [setCamera],
  )

  const zoomCenter = useCallback((factor: number) => zoomAt({ x: size.w / 2, y: size.h / 2 }, factor), [zoomAt, size])

  const toScreen = (clientX: number, clientY: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }
  const toWorld = (s: Pt): Pt => {
    const cam = useEditor.getState().camera
    return { x: cam.x + s.x / cam.zoom, y: cam.y + s.y / cam.zoom }
  }

  // Wheel: pinch / ⌘-scroll zooms, any other scroll pans.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Line-mode deltas (some mouse wheels) count lines, not pixels.
      const k = e.deltaMode === 1 ? 20 : 1
      const dx = e.deltaX * k
      const dy = e.deltaY * k
      if (e.ctrlKey || e.metaKey) {
        // Pinch sends small steps; a mouse wheel notch is ~100px and needs a gentler rate.
        const notch = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)
        zoomAt(toScreen(e.clientX, e.clientY), Math.exp(-dy * (notch ? 0.0015 : 0.01)))
      } else {
        const cam = useEditor.getState().camera
        setCamera({ ...cam, x: cam.x + dx / cam.zoom, y: cam.y + dy / cam.zoom })
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoomAt, setCamera])

  const ctx: ToolContext = useMemo(
    () => ({
      zoom: () => useEditor.getState().camera.zoom,
      setPreview,
      snap(raw, opts, alt) {
        const { plan: p, camera: cam } = useEditor.getState()
        return snapPoint(raw, {
          walls: p!.walls,
          grid: p!.settings.gridSize,
          radius: 10 / cam.zoom,
          enabled: p!.settings.snap && !alt,
          ...opts,
        })
      },
    }),
    [],
  )

  const tools: Record<ToolId, Tool> = useMemo(
    () => ({
      select: selectTool(ctx, () => defsRef.current),
      wall: wallTool(ctx),
      arc: arcTool(ctx),
      room: roomTool(ctx),
      opening: openingTool(ctx),
      measure: measureTool(ctx),
      label: labelTool(ctx),
      pan: { cursor: 'grab' },
    }),
    [ctx],
  )

  useEffect(() => {
    const active = tools[tool]
    return () => active.cancel?.()
  }, [tool, tools])

  useShortcuts({ tools, fit, zoomCenter, setSpaceDown })

  function pointerInfo(e: React.PointerEvent | React.MouseEvent): PointerInfo {
    const screen = toScreen(e.clientX, e.clientY)
    const el = e.target as Element
    const handleEl = el.closest?.('[data-handle]') as SVGElement | null
    const entityEl = el.closest?.('[data-kind]') as SVGElement | null
    let handle: Handle | null = null
    if (handleEl) {
      const ds = handleEl.dataset
      const id = ds.id!
      if (ds.handle === 'item-resize') handle = { type: 'item-resize', id, sx: Number(ds.sx), sy: Number(ds.sy) }
      else if (ds.handle === 'item-rotate') handle = { type: 'item-rotate', id }
      else if (ds.handle === 'wall-bend') handle = { type: 'wall-bend', id }
      else if (ds.handle === 'wall-end') handle = { type: 'wall-end', id, end: ds.end as 'a' | 'b' }
      else if (ds.handle === 'dim-end') handle = { type: 'dim-end', id, end: ds.end as 'a' | 'b' }
    }
    const target: SelectionRef | null = entityEl ? { kind: entityEl.dataset.kind as SelectionRef['kind'], id: entityEl.dataset.id! } : null
    return {
      raw: toWorld(screen),
      screen,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey || e.ctrlKey,
      button: e.button,
      detail: e.detail,
      target,
      handle,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null)
    if (e.button === 2) return
    svgRef.current?.setPointerCapture(e.pointerId)
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'pan'))) {
      e.preventDefault()
      panRef.current = { screen: { x: e.clientX, y: e.clientY }, cam: useEditor.getState().camera }
      return
    }
    tools[tool].down?.(pointerInfo(e))
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current
    if (pan) {
      setCamera({
        ...pan.cam,
        x: pan.cam.x - (e.clientX - pan.screen.x) / pan.cam.zoom,
        y: pan.cam.y - (e.clientY - pan.screen.y) / pan.cam.zoom,
      })
      return
    }
    const info = pointerInfo(e)
    setCursor(info.raw)
    tools[tool].move?.(info)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (panRef.current) {
      panRef.current = null
      return
    }
    tools[tool].up?.(pointerInfo(e))
  }

  const onDrop = (e: React.DragEvent) => {
    const defId = e.dataTransfer.getData(DEF_MIME)
    if (!defId) return
    e.preventDefault()
    const p = toWorld(toScreen(e.clientX, e.clientY))
    const step = plan.settings.snap ? plan.settings.gridSize / 2 : 1
    const id = uid()
    const st = useEditor.getState()
    st.commit((pl) => void pl.items.push({ id, defId, x: round(p.x, step), y: round(p.y, step), rotation: 0 }))
    st.setSelection([{ kind: 'item', id }])
    st.setTool('select')
  }

  const vw = size.w / camera.zoom
  const vh = size.h / camera.zoom
  const g = plan.settings.gridSize
  const showMinor = g * camera.zoom >= 6
  const cursorStyle = panRef.current ? 'grabbing' : spaceDown ? 'grab' : (tools[tool].cursor ?? 'default')

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="canvas"
        viewBox={`${camera.x} ${camera.y} ${vw || 1} ${vh || 1}`}
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={(e) => tools[tool].dblclick?.(pointerInfo(e))}
        onContextMenu={(e) => {
          e.preventDefault()
          if (tool !== 'select') return
          const info = pointerInfo(e)
          const st = useEditor.getState()
          if (info.target && !st.selection.some((x) => x.kind === info.target!.kind && x.id === info.target!.id)) st.setSelection([info.target])
          if (info.target || st.selection.length) setMenu(info.screen)
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DEF_MIME)) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="grid-minor" width={g} height={g} patternUnits="userSpaceOnUse">
            <path d={`M ${g} 0 L 0 0 0 ${g}`} fill="none" stroke={colors.gridMinor} strokeWidth={unit} />
          </pattern>
          <pattern id="grid-major" width={100} height={100} patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke={colors.gridMajor} strokeWidth={unit} />
          </pattern>
        </defs>
        <g pointerEvents="none">
          {showMinor && <rect x={camera.x} y={camera.y} width={vw} height={vh} fill="url(#grid-minor)" />}
          <rect x={camera.x} y={camera.y} width={vw} height={vh} fill="url(#grid-major)" />
          <line x1={-12 * unit} y1={0} x2={12 * unit} y2={0} stroke={colors.axis} strokeWidth={unit} />
          <line x1={0} y1={-12 * unit} x2={0} y2={12 * unit} stroke={colors.axis} strokeWidth={unit} />
        </g>
        <g className={tool === 'select' ? 'hit-enabled' : 'hit-disabled'}>
          <PlanLayers plan={plan} defs={defs} rooms={rooms} unit={unit} showDims={plan.settings.showDims} interactive />
        </g>
        <Overlay plan={plan} defs={defs} selection={selection} unit={unit} interactiveHandles={tool === 'select'} />
        <PreviewLayer plan={plan} preview={preview} unit={unit} />
      </svg>

      <div className="canvas-status mono">
        <span className="status-hint">{HINTS[tool]}</span>
        <span className="spacer" />
        {cursor && (
          <span>
            X {Math.round(cursor.x)} · Y {Math.round(cursor.y)}
          </span>
        )}
        <span>{plan.settings.snap ? 'SNAP ON' : 'SNAP OFF'}</span>
      </div>

      {menu && <ContextMenu at={menu} onClose={() => setMenu(null)} />}

      <div className="zoom-ctl">
        <button className="icon-btn" title="Zoom out (−)" onClick={() => zoomCenter(1 / 1.25)}>
          <Minus size={14} />
        </button>
        <span className="mono zoom-val">{Math.round(camera.zoom * 100)}%</span>
        <button className="icon-btn" title="Zoom in (+)" onClick={() => zoomCenter(1.25)}>
          <Plus size={14} />
        </button>
        <button className="icon-btn" title="Fit to plan (0)" onClick={fit}>
          <Maximize size={14} />
        </button>
      </div>
    </div>
  )
}

/** Right-click menu for the current selection. */
function ContextMenu({ at, onClose }: { at: Pt; onClose: () => void }) {
  const plan = useEditor((s) => s.plan) as Plan
  const sel = useEditor((s) => s.selection)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)

  // Keep the menu inside the canvas.
  useEffect(() => {
    const el = ref.current
    const host = el?.parentElement
    if (!el || !host) return
    setPos({ x: Math.min(at.x, host.clientWidth - el.offsetWidth - 4), y: Math.min(at.y, host.clientHeight - el.offsetHeight - 4) })
  }, [at])

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      onClose()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('wheel', onClose, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('wheel', onClose, true)
    }
  }, [onClose])

  if (!sel.length) return null
  const st = useEditor.getState()
  const run = (f: () => void) => () => {
    f()
    onClose()
  }
  const hasItems = sel.some((s) => s.kind === 'item')
  const walls = sel.filter((s) => s.kind === 'wall')
  const room = stackRoom(plan, sel)
  const z = (move: ZMove) => run(() => st.commit((p) => reorderItems(p, sel, move)))

  return (
    <div className="ctx-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {hasItems && (
        <>
          <button role="menuitem" disabled={!room.up} onClick={z('front')}>
            <BringToFront size={14} /> Bring to front <kbd>⇧]</kbd>
          </button>
          <button role="menuitem" disabled={!room.up} onClick={z('forward')}>
            <span className="ctx-pad" /> Bring forward <kbd>]</kbd>
          </button>
          <button role="menuitem" disabled={!room.down} onClick={z('backward')}>
            <span className="ctx-pad" /> Send backward <kbd>[</kbd>
          </button>
          <button role="menuitem" disabled={!room.down} onClick={z('back')}>
            <SendToBack size={14} /> Send to back <kbd>⇧[</kbd>
          </button>
          <hr />
          <button role="menuitem" onClick={run(() => st.commit((p) => rotateSelection(p, sel, 90)))}>
            <RotateCw size={14} /> Rotate 90° <kbd>R</kbd>
          </button>
        </>
      )}
      {walls.length > 0 && (
        <button
          role="menuitem"
          onClick={run(() =>
            st.commit((p) => {
              const ids = new Set(walls.map((w) => w.id))
              for (const w of p.walls) if (ids.has(w.id)) w.align = flipAlign(w.align)
            }),
          )}
        >
          <FlipVertical2 size={14} /> Flip thickness side <kbd>F</kbd>
        </button>
      )}
      <button
        role="menuitem"
        onClick={run(() => {
          let next = sel
          st.commit((p) => void (next = duplicateSelection(p, sel, { x: 20, y: 20 })))
          st.setSelection(next)
        })}
      >
        <Copy size={14} /> Duplicate <kbd>⌘D</kbd>
      </button>
      <button
        role="menuitem"
        onClick={run(() => {
          st.commit((p) => deleteSelection(p, sel))
          st.setSelection([])
        })}
      >
        <Trash2 size={14} /> Delete <kbd>⌫</kbd>
      </button>
    </div>
  )
}
