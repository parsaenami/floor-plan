import type { Pt } from '../../model/types'
import { clipCenter, copySelection, deleteSelection, pasteClip, type Clip } from '../../model/ops'
import { round } from '../../geometry/vec'
import { useEditor } from '../../store/editorStore'

const KEY = 'floorplan.clipboard'

// localStorage lets paste reach other plans and tabs; the in-memory copy covers
// storage being unavailable.
let memory: Clip | null = null

function readClip(): Clip | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Clip
  } catch {
    /* fall back to memory */
  }
  return memory
}

export const hasClipboard = () => !!readClip()

/** Copies the selection to the clipboard; returns false when nothing is selected. */
export function copyToClipboard() {
  const { plan, selection } = useEditor.getState()
  if (!plan || !selection.length) return false
  memory = copySelection(plan, selection)
  const json = JSON.stringify(memory)
  try {
    localStorage.setItem(KEY, json)
  } catch {
    /* memory only */
  }
  navigator.clipboard?.writeText(json).catch(() => {})
  return true
}

export function cutToClipboard() {
  if (!copyToClipboard()) return false
  const st = useEditor.getState()
  const sel = st.selection
  st.commit((p) => deleteSelection(p, sel))
  st.setSelection([])
  return true
}

/**
 * Pastes the clipboard into the open plan as one undo step and selects it:
 * centred on `at` (world cm) when given, else 20 cm off the original spot.
 */
export function pasteClipboard(at?: Pt | null) {
  const st = useEditor.getState()
  const clip = readClip()
  if (!st.plan || !clip) return false
  const c = clipCenter(clip)
  const step = st.plan.settings.snap ? st.plan.settings.gridSize : 1
  const offset = at && c ? { x: round(at.x - c.x, step), y: round(at.y - c.y, step) } : { x: 20, y: 20 }
  let next = st.selection
  st.commit((p) => void (next = pasteClip(p, clip, offset)))
  st.setTool('select')
  st.setSelection(next)
  return true
}
