import { useEffect } from 'react'
import type { OpeningKind, Pt } from '../../model/types'
import { deleteSelection, duplicateSelection, reorderItems, rotateSelection, selectAll, toggleLock, translateSelection } from '../../model/ops'
import { flipAlign } from '../../geometry/walls'
import { useEditor, type ToolId } from '../../store/editorStore'
import { copyToClipboard, cutToClipboard, pasteClipboard } from './clipboard'
import { useHelp } from './help'
import type { Tool } from './tools/types'

const TOOL_KEYS: Record<string, [ToolId, OpeningKind?]> = {
  v: ['select'],
  w: ['wall'],
  a: ['arc'],
  b: ['room'],
  d: ['opening', 'door'],
  n: ['opening', 'window'],
  m: ['measure'],
  t: ['label'],
  h: ['pan'],
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export function flipSelectedOpenings(which: 'flipSide' | 'flipHinge') {
  const { selection, commit } = useEditor.getState()
  const ids = new Set(selection.filter((s) => s.kind === 'opening').map((s) => s.id))
  if (!ids.size) return false
  commit((p) => p.openings.forEach((o) => ids.has(o.id) && (o[which] = !o[which])))
  return true
}

/** Moves each selected wall's thickness to the other side of its line. */
export function flipSelectedWalls() {
  const { selection, commit } = useEditor.getState()
  const ids = new Set(selection.filter((s) => s.kind === 'wall').map((s) => s.id))
  if (!ids.size) return false
  commit((p) => p.walls.forEach((w) => ids.has(w.id) && (w.align = flipAlign(w.align))))
  return true
}

export function useShortcuts({
  tools,
  fit,
  zoomCenter,
  setSpaceDown,
  cursor,
}: {
  tools: Record<ToolId, Tool>
  fit: () => void
  zoomCenter: (f: number) => void
  setSpaceDown: (v: boolean) => void
  /** World position of the pointer while it is over the canvas. */
  cursor: { current: Pt | null }
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const st = useEditor.getState()
      if (!st.plan) return
      if (tools[st.tool].key?.(e)) {
        e.preventDefault()
        return
      }
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const sel = st.selection

      if (e.key === ' ') {
        e.preventDefault()
        setSpaceDown(true)
        return
      }
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        st.setTool('select')
        st.setSelection(selectAll(st.plan))
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        if (!sel.length) return
        let next = sel
        st.commit((p) => void (next = duplicateSelection(p, sel, { x: 20, y: 20 })))
        st.setSelection(next)
        return
      }
      if (mod && key === 'c' && copyToClipboard()) return e.preventDefault()
      if (mod && key === 'x' && cutToClipboard()) return e.preventDefault()
      if (mod && key === 'v' && pasteClipboard(cursor.current)) return e.preventDefault()
      if (mod && key === 'l') {
        e.preventDefault()
        if (sel.some((s) => s.kind === 'item')) st.commit((p) => toggleLock(p, sel))
        return
      }
      if (mod) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!sel.length) return
        e.preventDefault()
        // Locked items survive and stay selected.
        st.commit((p) => deleteSelection(p, sel))
        return
      }
      if (e.key === 'Escape') {
        if (useHelp.getState().open) return useHelp.getState().set(false)
        if (st.tool !== 'select') st.setTool('select')
        else st.setSelection([])
        return
      }
      if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault()
        const k = e.shiftKey ? 10 : 1
        const delta = {
          x: e.key === 'ArrowLeft' ? -k : e.key === 'ArrowRight' ? k : 0,
          y: e.key === 'ArrowUp' ? -k : e.key === 'ArrowDown' ? k : 0,
        }
        st.commit((p) => translateSelection(p, sel, delta))
        return
      }
      if (key === 'r' && sel.some((s) => s.kind === 'item')) {
        st.commit((p) => rotateSelection(p, sel, e.shiftKey ? -90 : 90))
        return
      }
      if (key === 'f' && flipSelectedOpenings(e.shiftKey ? 'flipHinge' : 'flipSide')) return
      if (key === 'f' && !e.shiftKey && flipSelectedWalls()) return
      // Stacking order; e.code keeps ⇧[ / ⇧] working on layouts where they type { }.
      if ((e.code === 'BracketRight' || e.code === 'BracketLeft') && sel.some((s) => s.kind === 'item')) {
        e.preventDefault()
        const up = e.code === 'BracketRight'
        st.commit((p) => reorderItems(p, sel, e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward'))
        return
      }
      if (key === '0') return fit()
      if (key === '=' || key === '+') return zoomCenter(1.25)
      if (key === '-') return zoomCenter(1 / 1.25)
      if (key === 'g') {
        st.commit((p) => void (p.settings.snap = !p.settings.snap))
        return
      }
      if (e.key === '?') return useHelp.getState().set(!useHelp.getState().open)
      const t = TOOL_KEYS[key]
      if (t && !e.altKey) st.setTool(t[0], t[1])
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false)
    }
    const onBlur = () => setSpaceDown(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [tools, fit, zoomCenter, setSpaceDown, cursor])
}
