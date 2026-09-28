import { ArrowLeft, Copy, FileDown, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CATEGORIES, type Category, type ComponentDef, type PresetShape } from '../model/types'
import { uid } from '../model/defaults'
import { downloadJson, libraryFile, parseFile, pickFile } from '../persistence/importExport'
import { SymbolPreview } from '../render/SymbolPreview'
import { PRESET_SHAPES, defaultArm, symbolFor } from '../symbols'
import { BUILTIN_COMPONENTS } from '../symbols/library'
import { useComponents } from '../store/componentsStore'
import { ConfirmModal, Field, NumberInput, Segmented, toast } from '../ui'
import { ShapeDesigner } from './components/ShapeDesigner'
import './components.css'
import { SettingsButton } from '../settings/SettingsButton'

type ShapeChoice = PresetShape | 'builtin' | 'drawn'

function blankDraft(): ComponentDef {
  return {
    id: '',
    name: 'My component',
    category: 'Other',
    width: 120,
    depth: 80,
    symbol: { kind: 'drawn', shapes: [] },
    builtin: false,
  }
}

export function ComponentsPage() {
  const custom = useComponents((s) => s.custom)
  const { upsert, upsertMany, remove } = useComponents.getState()
  const [draft, setDraft] = useState<ComponentDef>(blankDraft)
  const [deleting, setDeleting] = useState<ComponentDef | null>(null)
  const editing = draft.id !== '' && custom.some((c) => c.id === draft.id)

  const shape: ShapeChoice = draft.symbol.kind === 'preset' ? draft.symbol.shape : draft.symbol.kind
  const set = (patch: Partial<ComponentDef>) => setDraft((d) => ({ ...d, ...patch }))

  function save() {
    const name = draft.name.trim()
    if (!name) return toast('Give the component a name')
    if (draft.symbol.kind === 'drawn' && !draft.symbol.shapes.length) return toast('Draw at least one shape first')
    const def = { ...draft, name, id: draft.id || `custom:${uid()}` }
    void upsert(def)
    setDraft(def)
    toast(editing ? 'Component updated' : 'Component created — find it in the editor library')
  }

  function customizeBuiltin(b: ComponentDef) {
    setDraft({ ...b, id: '', name: `My ${b.name.toLowerCase()}`, builtin: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function importLibrary() {
    const file = await pickFile()
    if (!file) return
    try {
      const parsed = parseFile(await file.text())
      await upsertMany(parsed.components)
      toast(`Imported ${parsed.components.length} components`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <div className="comp">
      <header className="topbar page-bar">
        <Link to="/" className="icon-btn" title="All plans">
          <ArrowLeft size={16} />
        </Link>
        <Link to="/" className="brand">
          <span className="brand-mark" />
          Floor Plan Studio
        </Link>
        <div className="spacer" />
        <SettingsButton />
        <button className="btn ghost" onClick={importLibrary}>
          <Upload size={14} /> Import
        </button>
        <button className="btn ghost" disabled={!custom.length} onClick={() => downloadJson(libraryFile(custom), 'components.json')}>
          <FileDown size={14} /> Export
        </button>
      </header>

      <main className="comp-main">
        <section className="comp-builder">
          <div className="comp-builder-head">
            <div>
              <div className="eyebrow">{editing ? 'Edit component' : 'New component'}</div>
              <h1>{draft.name || 'Untitled'}</h1>
            </div>
            {editing && (
              <button className="btn sm ghost" onClick={() => setDraft(blankDraft())}>
                <Plus size={13} /> New
              </button>
            )}
          </div>
          <div className={`comp-builder-body${draft.symbol.kind === 'drawn' ? ' drawing' : ''}`}>
            {draft.symbol.kind === 'drawn' ? (
              <ShapeDesigner
                width={draft.width}
                depth={draft.depth}
                shapes={draft.symbol.shapes}
                onChange={(shapes) => set({ symbol: { kind: 'drawn', shapes } })}
                onFit={(width, depth, shapes) => set({ width, depth, symbol: { kind: 'drawn', shapes } })}
              />
            ) : (
              <div className="comp-preview">
                <SymbolPreview def={draft} size={360} dims />
              </div>
            )}
            <div className="comp-form">
              <Field label="Name">
                <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
              </Field>
              <Field label="Category">
                <select className="select" value={draft.category} onChange={(e) => set({ category: e.target.value as Category })}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <div className="comp-row3">
                <Field label="Width">
                  <NumberInput value={draft.width} min={5} max={2000} suffix="cm" onChange={(width) => set({ width })} />
                </Field>
                <Field label="Depth">
                  <NumberInput value={draft.depth} min={5} max={2000} suffix="cm" onChange={(depth) => set({ depth })} />
                </Field>
                <Field label="Height">
                  <NumberInput value={draft.height ?? 0} min={0} max={1000} suffix="cm" onChange={(height) => set({ height: height || undefined })} />
                </Field>
              </div>
              <Field label="Symbol">
                <Segmented<ShapeChoice>
                  value={shape}
                  onChange={(v) =>
                    set({
                      symbol:
                        v === 'drawn'
                          ? // Start the drawing from whatever the symbol looks like now.
                            { kind: 'drawn', shapes: draft.symbol.kind === 'drawn' ? draft.symbol.shapes : symbolFor(draft) }
                          : v === 'builtin'
                            ? { kind: 'builtin', key: draft.symbol.kind === 'builtin' ? draft.symbol.key : 'desk' }
                            : { kind: 'preset', shape: v, arm: v === 'lshape' ? defaultArm(draft.width, draft.depth) : undefined },
                    })
                  }
                  options={[{ value: 'drawn' as const, label: 'Draw' }, ...PRESET_SHAPES, { value: 'builtin' as const, label: 'Built-in' }]}
                />
              </Field>
              {draft.symbol.kind === 'builtin' && (
                <Field label="Drawn like">
                  <select
                    className="select"
                    value={draft.symbol.key}
                    onChange={(e) => set({ symbol: { kind: 'builtin', key: e.target.value } })}
                  >
                    {BUILTIN_COMPONENTS.map((b) => (
                      <option key={b.id} value={(b.symbol as { key: string }).key}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {draft.symbol.kind === 'preset' && draft.symbol.shape === 'lshape' && (
                <Field label="Arm depth">
                  <NumberInput
                    value={draft.symbol.arm ?? defaultArm(draft.width, draft.depth)}
                    min={5}
                    max={Math.min(draft.width, draft.depth) - 5}
                    suffix="cm"
                    onChange={(arm) => set({ symbol: { kind: 'preset', shape: 'lshape', arm } })}
                  />
                </Field>
              )}
              <p className="comp-note">
                {draft.symbol.kind === 'drawn'
                  ? 'Draw inside the dashed box, which is the component’s width × depth. Anything goes: lines, polygons, arcs, pie slices, freehand and text. Placed copies stretch with the box when resized.'
                  : 'Symbols scale to the size you enter. Pick Draw to edit this symbol by hand. You can still resize each placed copy in the editor.'}
              </p>
              <div className="comp-actions">
                <button className="btn primary" onClick={save}>
                  {editing ? 'Save changes' : 'Create component'}
                </button>
                {editing && (
                  <button className="btn ghost" onClick={() => setDraft(blankDraft())}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="comp-section-head">
            <h2>Your components</h2>
            <span className="mono">{String(custom.length).padStart(2, '0')}</span>
          </div>
          {custom.length === 0 ? (
            <div className="empty">Nothing here yet. Create one above, or customise a built-in component below.</div>
          ) : (
            <div className="comp-grid">
              {custom.map((c) => (
                <article key={c.id} className={`comp-card${draft.id === c.id ? ' active' : ''}`}>
                  <div className="comp-card-thumb">
                    <SymbolPreview def={c} size={120} />
                  </div>
                  <div className="comp-card-foot">
                    <div className="comp-card-meta">
                      <div className="comp-card-name">{c.name}</div>
                      <div className="mono comp-card-sub">
                        {c.category} · {c.width}×{c.depth}
                        {c.height ? `×${c.height}` : ''}
                      </div>
                    </div>
                    <button className="icon-btn" title="Edit" onClick={() => setDraft(c)}>
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Duplicate"
                      onClick={() => {
                        void upsert({ ...c, id: `custom:${uid()}`, name: `${c.name} copy` })
                        toast('Component duplicated')
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button className="icon-btn" title="Delete" onClick={() => setDeleting(c)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="comp-section-head">
            <h2>Built-in</h2>
            <span className="mono">{BUILTIN_COMPONENTS.length}</span>
          </div>
          {CATEGORIES.map((cat) => {
            const list = BUILTIN_COMPONENTS.filter((b) => b.category === cat)
            if (!list.length) return null
            return (
              <div key={cat} className="comp-cat">
                <div className="eyebrow">{cat}</div>
                <div className="comp-grid small">
                  {list.map((b) => (
                    <button key={b.id} className="comp-card mini" onClick={() => customizeBuiltin(b)} title="Customise as a new component">
                      <div className="comp-card-thumb">
                        <SymbolPreview def={b} size={80} />
                      </div>
                      <div className="comp-card-name">{b.name}</div>
                      <div className="mono comp-card-sub">
                        {b.width}×{b.depth}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      </main>

      {deleting && (
        <ConfirmModal
          title="Delete component"
          message={
            <>
              Delete <strong>{deleting.name}</strong>? Plans that use it will show a placeholder box.
            </>
          }
          onConfirm={() => {
            void remove(deleting.id)
            if (draft.id === deleting.id) setDraft(blankDraft())
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
