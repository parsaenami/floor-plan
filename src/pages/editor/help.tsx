import { create } from 'zustand'
import { Modal } from '../../ui'

export const useHelp = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}))

const GROUPS: [string, [string, string][]][] = [
  [
    'Tools',
    [
      ['V', 'Select'],
      ['W', 'Draw walls'],
      ['A', 'Curved walls'],
      ['B', 'Rectangle room'],
      ['D', 'Door'],
      ['N', 'Window'],
      ['M', 'Measure'],
      ['T', 'Room label'],
      ['H / Space', 'Pan'],
    ],
  ],
  [
    'Edit',
    [
      ['⌘Z / ⇧⌘Z', 'Undo / redo'],
      ['⌘D', 'Duplicate'],
      ['⌘A', 'Select all'],
      ['Delete', 'Delete selection'],
      ['R / ⇧R', 'Rotate 90°'],
      ['F / ⇧F', 'Flip door side / hinge'],
      ['F (wall)', 'Flip wall thickness side'],
      ['] / [', 'Bring forward / send backward'],
      ['⇧] / ⇧[', 'Bring to front / send to back'],
      ['Arrows', 'Nudge 1 cm (⇧ 10 cm)'],
      ['Esc', 'Finish / deselect'],
    ],
  ],
  [
    'View & snapping',
    [
      ['Pinch / ⌘-scroll', 'Zoom'],
      ['Scroll', 'Pan'],
      ['0', 'Fit plan'],
      ['+ / −', 'Zoom in / out'],
      ['G', 'Toggle snapping'],
      ['⇧ while drawing', 'Free angle'],
      ['⌥ while dragging', 'Disable snapping'],
    ],
  ],
]

export function HelpOverlay() {
  const { open, set } = useHelp()
  if (!open) return null
  return (
    <Modal title="Keyboard shortcuts" onClose={() => set(false)} wide>
      <div className="help-grid">
        {GROUPS.map(([title, rows]) => (
          <section key={title}>
            <div className="eyebrow">{title}</div>
            <dl>
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt className="mono">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
