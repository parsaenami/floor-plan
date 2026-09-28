import { ArrowLeft, Download, FileJson, Keyboard, Magnet, Map as MapIcon, Redo2, Ruler, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Plan } from '../../model/types'
import { ExportModal } from '../../export/ExportModal'
import { downloadJson, planFile, slug } from '../../persistence/importExport'
import { useComponents, useDefMap } from '../../store/componentsStore'
import { useEditor } from '../../store/editorStore'
import { ThemePicker } from '../../ui'
import { emitLocalChange } from '../../sync/events'
import { DriveButton } from '../../sync/DriveButton'
import { usePlans } from '../../store/plansStore'
import { Canvas } from './Canvas'
import { HelpOverlay, useHelp } from './help'
import { LibraryPanel } from './LibraryPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { Toolbar } from './Toolbar'
import './editor.css'

const SAVE_DELAY = 400

export function EditorPage() {
  const { id } = useParams()
  const loaded = usePlans((s) => s.loaded)
  const stored = usePlans((s) => s.plans.find((p) => p.id === id))
  const plan = useEditor((s) => s.plan)
  const ready = plan?.id === id

  // Load the plan into the editor once the plan list is available.
  // Only the id matters here: later store updates come from our own autosave.
  const storedId = stored?.id
  useEffect(() => {
    const p = usePlans.getState().plans.find((x) => x.id === storedId)
    if (p) useEditor.getState().load(p)
    return () => {
      useEditor.getState().close()
      // Sync holds back Drive updates to the open plan; let them through now.
      emitLocalChange({ type: 'plan-saved' })
    }
  }, [storedId])

  useAutosave()

  if (!loaded) return <div className="editor-msg mono">Loading…</div>
  if (!stored)
    return (
      <div className="editor-msg">
        <p>This plan doesn’t exist.</p>
        <Link to="/" className="btn">
          Back to plans
        </Link>
      </div>
    )
  if (!ready) return <div className="editor-msg mono">Loading…</div>
  return <EditorLayout />
}

function useAutosave() {
  const upsert = usePlans((s) => s.upsert)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<Plan | null>(null)
  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current)
      if (pending.current) void upsert(pending.current)
      pending.current = null
    }
    const unsub = useEditor.subscribe((s, prev) => {
      const changed = s.plan !== prev.plan || (prev.txBase && !s.txBase)
      if (!s.plan || !changed || s.plan.id !== prev.plan?.id) return
      // Skip saving the intermediate states of a drag.
      if (s.txBase) return
      pending.current = s.plan
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_DELAY)
    })
    window.addEventListener('beforeunload', flush)
    return () => {
      unsub()
      flush()
      window.removeEventListener('beforeunload', flush)
    }
  }, [upsert])
}

function EditorLayout() {
  const plan = useEditor((s) => s.plan) as Plan
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const { undo, redo, commit } = useEditor.getState()
  const defs = useDefMap()
  const custom = useComponents((s) => s.custom)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    document.title = `${plan.name} · Floor Plan Studio`
    return () => {
      document.title = 'Floor Plan Studio'
    }
  }, [plan.name])

  return (
    <div className="editor">
      <header className="topbar">
        <Link to="/" className="icon-btn" title="All plans">
          <ArrowLeft size={16} />
        </Link>
        <input
          key={plan.id + plan.name}
          className="plan-title"
          defaultValue={plan.name}
          aria-label="Plan name"
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== plan.name) commit((p) => void (p.name = name))
            else e.target.value = plan.name
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="vr" />
        <button className="icon-btn" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
        <div className="vr" />
        <button
          className="icon-btn"
          title="Snapping (G)"
          aria-pressed={plan.settings.snap}
          onClick={() => commit((p) => void (p.settings.snap = !p.settings.snap))}
        >
          <Magnet size={16} />
        </button>
        <button
          className="icon-btn"
          title="Room dimensions"
          aria-pressed={plan.settings.showDims}
          onClick={() => commit((p) => void (p.settings.showDims = !p.settings.showDims))}
        >
          <Ruler size={16} />
        </button>
        <div className="spacer" />
        <ThemePicker />
        <DriveButton compact />
        <button className="icon-btn" title="Keyboard shortcuts (?)" onClick={() => useHelp.getState().set(true)}>
          <Keyboard size={16} />
        </button>
        <button className="btn ghost" title="Download plan as JSON" onClick={() => downloadJson(planFile(plan, custom), `${slug(plan.name)}.json`)}>
          <FileJson size={14} /> JSON
        </button>
        <Link to={`/plan/${plan.id}/output`} className="btn">
          <MapIcon size={14} /> Output
        </Link>
        <button className="btn primary" onClick={() => setExporting(true)}>
          <Download size={14} /> Export
        </button>
      </header>
      <div className="editor-body">
        <Toolbar />
        <LibraryPanel />
        <Canvas defs={defs} />
        <PropertiesPanel defs={defs} />
      </div>
      <HelpOverlay />
      {exporting && <ExportModal plan={plan} defs={defs} onClose={() => setExporting(false)} />}
    </div>
  )
}
