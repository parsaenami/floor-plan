import { AppWindow, DoorOpen, Hand, MousePointer2, PenLine, Ruler, Spline, Square, Type } from 'lucide-react'
import type { ReactNode } from 'react'
import type { OpeningKind } from '../../model/types'
import { useEditor, type ToolId } from '../../store/editorStore'

const TOOLS: { tool: ToolId; kind?: OpeningKind; label: string; key: string; icon: ReactNode }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: <MousePointer2 size={16} /> },
  { tool: 'wall', label: 'Wall', key: 'W', icon: <PenLine size={16} /> },
  { tool: 'arc', label: 'Curved wall', key: 'A', icon: <Spline size={16} /> },
  { tool: 'room', label: 'Room', key: 'B', icon: <Square size={16} /> },
  { tool: 'opening', kind: 'door', label: 'Door', key: 'D', icon: <DoorOpen size={16} /> },
  { tool: 'opening', kind: 'window', label: 'Window', key: 'N', icon: <AppWindow size={16} /> },
  { tool: 'measure', label: 'Measure', key: 'M', icon: <Ruler size={16} /> },
  { tool: 'label', label: 'Label', key: 'T', icon: <Type size={16} /> },
  { tool: 'pan', label: 'Pan', key: 'H', icon: <Hand size={16} /> },
]

export function Toolbar() {
  const tool = useEditor((s) => s.tool)
  const openingKind = useEditor((s) => s.openingKind)
  const setTool = useEditor((s) => s.setTool)
  const isWindow = openingKind === 'window'
  return (
    <nav className="toolbar" aria-label="Tools">
      {TOOLS.map((t) => {
        const active = tool === t.tool && (t.tool !== 'opening' || (t.kind === 'window') === isWindow)
        return (
          <button
            key={t.label}
            className="tool-btn"
            aria-pressed={active}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.tool, t.kind)}
          >
            {t.icon}
            <span className="tool-key mono">{t.key}</span>
          </button>
        )
      })}
    </nav>
  )
}
