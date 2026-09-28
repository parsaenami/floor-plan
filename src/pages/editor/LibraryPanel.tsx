import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CATEGORIES, type ComponentDef, type OpeningKind } from '../../model/types'
import { OPENING_LABEL, uid } from '../../model/defaults'
import { round } from '../../geometry/vec'
import { SymbolPreview } from '../../render/SymbolPreview'
import { useAllComponents } from '../../store/componentsStore'
import { useEditor } from '../../store/editorStore'
import { DEF_MIME } from './Canvas'

const OPENING_KINDS = Object.keys(OPENING_LABEL) as OpeningKind[]

function placeAtCenter(def: ComponentDef) {
  const st = useEditor.getState()
  const canvas = document.querySelector('.canvas-wrap')
  if (!st.plan || !canvas) return
  const { camera } = st
  const x = round(camera.x + canvas.clientWidth / 2 / camera.zoom, 5)
  const y = round(camera.y + canvas.clientHeight / 2 / camera.zoom, 5)
  const id = uid()
  st.commit((p) => void p.items.push({ id, defId: def.id, x, y, rotation: 0 }))
  st.setSelection([{ kind: 'item', id }])
  st.setTool('select')
}

export function LibraryPanel() {
  const all = useAllComponents()
  const [q, setQ] = useState('')
  const tool = useEditor((s) => s.tool)
  const openingKind = useEditor((s) => s.openingKind)
  const setTool = useEditor((s) => s.setTool)

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    const match = (d: ComponentDef) => !query || d.name.toLowerCase().includes(query) || d.category.toLowerCase().includes(query)
    const custom = all.filter((d) => !d.builtin && match(d))
    const byCat = CATEGORIES.map((c) => [c, all.filter((d) => d.builtin && d.category === c && match(d))] as const)
    return [['Custom', custom] as const, ...byCat].filter(([, list]) => list.length)
  }, [all, q])

  const openings = OPENING_KINDS.filter((k) => !q || OPENING_LABEL[k].toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <aside className="library">
      <div className="lib-search">
        <Search size={14} />
        <input placeholder="Search components" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="lib-scroll">
        {openings.length > 0 && (
          <section>
            <div className="eyebrow lib-title">Openings</div>
            <div className="lib-list">
              {openings.map((k) => (
                <button
                  key={k}
                  className="lib-row"
                  aria-pressed={tool === 'opening' && openingKind === k}
                  onClick={() => setTool('opening', k)}
                  title="Click, then hover a wall to place"
                >
                  <span className="lib-row-name">{OPENING_LABEL[k]}</span>
                  <span className="mono lib-row-dim">on wall</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {groups.map(([cat, list]) => (
          <section key={cat}>
            <div className="eyebrow lib-title">{cat}</div>
            <div className="lib-grid">
              {list.map((d) => (
                <button
                  key={d.id}
                  className="lib-tile"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DEF_MIME, d.id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => placeAtCenter(d)}
                  title={`${d.name} — drag onto the plan`}
                >
                  <span className="lib-thumb">
                    <SymbolPreview def={d} size={56} />
                  </span>
                  <span className="lib-name">{d.name}</span>
                  <span className="lib-dim mono">
                    {d.width}×{d.depth}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        <Link to="/components" className="btn sm block lib-new">
          <Plus size={13} /> New component
        </Link>
      </div>
    </aside>
  )
}
