import { Copy, FileDown, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Plan } from '../model/types'
import { detectRooms } from '../geometry/rooms'
import { downloadJson, parseFile, pickFile, planFile, slug } from '../persistence/importExport'
import { PlanThumb } from '../render/PlanThumb'
import { useComponents, useDefMap } from '../store/componentsStore'
import { usePlans, type Template } from '../store/plansStore'
import { ConfirmModal, Field, Modal, Segmented, ThemePicker, toast } from '../ui'
import { DriveButton } from '../sync/DriveButton'
import './dashboard.css'

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function Dashboard() {
  const { plans, loaded, create, rename, duplicate, remove, upsert } = usePlans()
  const custom = useComponents((s) => s.custom)
  const upsertComponents = useComponents((s) => s.upsertMany)
  const defs = useDefMap()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)

  async function importFile() {
    const file = await pickFile()
    if (!file) return
    try {
      const parsed = parseFile(await file.text())
      if (parsed.components.length) await upsertComponents(parsed.components)
      if (parsed.type === 'plan') {
        await upsert(parsed.plan)
        toast(`Imported “${parsed.plan.name}”`)
      } else {
        toast(`Imported ${parsed.components.length} components`)
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <div className="dash">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          Floor Plan Studio
        </Link>
        <div className="spacer" />
        <ThemePicker />
        <DriveButton />
        <Link to="/components" className="btn ghost">
          Components
        </Link>
        <button className="btn" onClick={importFile}>
          <Upload size={14} /> Import
        </button>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> New plan
        </button>
      </header>

      <main className="dash-main">
        <div className="dash-head">
          <div>
            <div className="eyebrow">Dashboard</div>
            <h1>Plans</h1>
          </div>
          <div className="dash-stats mono">
            <span>{String(plans.length).padStart(2, '0')} plans</span>
            <span>{String(custom.length).padStart(2, '0')} custom components</span>
          </div>
        </div>

        <div className="plan-grid">
          <button className="plan-card new" onClick={() => setCreating(true)}>
            <Plus size={22} strokeWidth={1.5} />
            <span>New plan</span>
          </button>
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              defs={defs}
              onOpen={() => navigate(`/plan/${p.id}`)}
              onRename={() => setRenaming(p)}
              onDuplicate={async () => {
                await duplicate(p.id)
                toast('Plan duplicated')
              }}
              onExport={() => downloadJson(planFile(p, custom), `${slug(p.name)}.json`)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
        {loaded && plans.length === 0 && (
          <p className="dash-hint mono">No plans yet. Start blank, or try the sample apartment to see how things work.</p>
        )}
      </main>

      {creating && (
        <NewPlanModal
          onClose={() => setCreating(false)}
          onCreate={async (name, template) => {
            const plan = await create(name, template)
            navigate(`/plan/${plan.id}`)
          }}
        />
      )}
      {renaming && (
        <RenameModal
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={(name) => rename(renaming.id, name)}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Delete plan"
          message={
            <>
              Delete <strong>{deleting.name}</strong>? This can’t be undone. Export it first if you want a backup.
            </>
          }
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function PlanCard({
  plan,
  defs,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: {
  plan: Plan
  defs: ReturnType<typeof useDefMap>
  onOpen: () => void
  onRename: () => void
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const rooms = useMemo(() => detectRooms(plan.walls, plan.roomLabels), [plan.walls, plan.roomLabels])
  const area = rooms.reduce((s, r) => s + r.area, 0)
  return (
    <article className="plan-card">
      <button className="plan-thumb" onClick={onOpen} aria-label={`Open ${plan.name}`}>
        <PlanThumb plan={plan} defs={defs} />
      </button>
      <div className="plan-foot">
        <div className="plan-meta">
          <button className="plan-name" onClick={onOpen}>
            {plan.name}
          </button>
          <div className="mono plan-sub">
            {dateFmt.format(plan.updatedAt)} · {rooms.length} rooms · {area.toFixed(1)} m²
          </div>
        </div>
        <div className="plan-actions">
          <button className="icon-btn" title="Rename" onClick={onRename}>
            <Pencil size={14} />
          </button>
          <button className="icon-btn" title="Duplicate" onClick={onDuplicate}>
            <Copy size={14} />
          </button>
          <button className="icon-btn" title="Export JSON" onClick={onExport}>
            <FileDown size={14} />
          </button>
          <button className="icon-btn" title="Delete" onClick={onDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  )
}

function NewPlanModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, t: Template) => void }) {
  const [name, setName] = useState('My home')
  const [template, setTemplate] = useState<Template>('blank')
  const submit = () => name.trim() && onCreate(name.trim(), template)
  return (
    <Modal
      title="New plan"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!name.trim()}>
            Create plan
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
      <Field label="Start from">
        <Segmented
          value={template}
          onChange={setTemplate}
          options={[
            { value: 'blank', label: 'Blank' },
            { value: 'sample', label: 'Sample apartment' },
          ]}
        />
      </Field>
    </Modal>
  )
}

function RenameModal({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (n: string) => void }) {
  const [name, setName] = useState(initial)
  const submit = () => {
    if (!name.trim()) return
    onSave(name.trim())
    onClose()
  }
  return (
    <Modal
      title="Rename plan"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
    </Modal>
  )
}
