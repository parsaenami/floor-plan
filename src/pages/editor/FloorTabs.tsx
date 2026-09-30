import { Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { addFloor, deleteFloor, moveFloor, renameFloor } from '../../model/floors'
import { useEditor } from '../../store/editorStore'

/** Tabs for switching between a plan's floors. Double-click renames, drag reorders. */
export function FloorTabs() {
  const floors = useEditor((s) => s.plan?.floors) ?? []
  const floorId = useEditor((s) => s.plan?.floorId)
  const { commit, setFloor } = useEditor.getState()
  const [editing, setEditing] = useState<string | null>(null)
  const dragged = useRef<string | null>(null)

  return (
    <div className="floor-tabs" role="tablist" aria-label="Floors">
      {floors.map((f, i) =>
        editing === f.id ? (
          <input
            key={f.id}
            className="floor-tab mono"
            autoFocus
            defaultValue={f.name}
            aria-label="Floor name"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (name && name !== f.name) commit((p) => renameFloor(p, f.id, name))
              setEditing(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <button
            key={f.id}
            className="floor-tab mono"
            role="tab"
            aria-selected={f.id === floorId}
            title="Double-click to rename, drag to reorder"
            draggable
            onClick={() => setFloor(f.id)}
            onDoubleClick={() => setEditing(f.id)}
            onDragStart={() => (dragged.current = f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragged.current && commit((p) => moveFloor(p, dragged.current!, i))}
          >
            {f.name}
            {f.id === floorId && floors.length > 1 && (
              <X
                size={12}
                role="button"
                aria-label={`Delete ${f.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  commit((p) => deleteFloor(p, f.id))
                }}
              />
            )}
          </button>
        ),
      )}
      <button className="icon-btn" title="Add floor" onClick={() => commit((p) => void addFloor(p, `Floor ${floors.length}`))}>
        <Plus size={14} />
      </button>
    </div>
  )
}
