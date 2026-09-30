import { ArrowDown, ArrowUp, BringToFront, Copy, FlipHorizontal2, FlipVertical2, Lock, LockOpen, RotateCw, SendToBack, Trash2 } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import type { Item, Opening, OpeningKind, Plan, SelectionRef, Wall } from '../../model/types'
import { OPENING_LABEL } from '../../model/defaults'
import {
  allLocked,
  canRotate,
  clampOpenings,
  deleteSelection,
  duplicateSelection,
  moveJoint,
  orientWalls,
  reorderItems,
  rotateSelection,
  stackRoom,
  toggleLock,
  type ZMove,
} from '../../model/ops'
import { detectRooms } from '../../geometry/rooms'
import { add, angleDeg, dist, norm, scale, sub } from '../../geometry/vec'
import { bulgeForSweep, clampOpeningOffset, flipAlign, sweepOf, wallArc, wallLength } from '../../geometry/walls'
import { FALLBACK_DEF, itemSize, type DefMap } from '../../render/planGeometry'
import { useEditor } from '../../store/editorStore'
import { Field, NumberInput, Segmented } from '../../ui'
import { formatArea, formatLength } from '../../units/units'
import { useUnits } from '../../units/unitsStore'

const st = () => useEditor.getState()

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="props-section">
      <div className="eyebrow">{title}</div>
      {children}
    </section>
  )
}

const Row = ({ children }: { children: ReactNode }) => <div className="props-row">{children}</div>

/** Stacking order buttons for selected furniture. */
function Arrange({ sel }: { sel: SelectionRef[] }) {
  const plan = useEditor((s) => s.plan) as Plan
  if (!sel.some((s) => s.kind === 'item')) return null
  const room = stackRoom(plan, sel)
  const z = (move: ZMove) => () => st().commit((p) => reorderItems(p, sel, move))
  return (
    <Section title="Arrange">
      <div className="props-arrange">
        <button className="btn sm" disabled={!room.up} onClick={z('front')} title="Bring to front (⇧])">
          <BringToFront size={13} /> Front
        </button>
        <button className="btn sm" disabled={!room.up} onClick={z('forward')} title="Bring forward (])">
          <ArrowUp size={13} /> Forward
        </button>
        <button className="btn sm" disabled={!room.down} onClick={z('backward')} title="Send backward ([)">
          <ArrowDown size={13} /> Backward
        </button>
        <button className="btn sm" disabled={!room.down} onClick={z('back')} title="Send to back (⇧[)">
          <SendToBack size={13} /> Back
        </button>
      </div>
    </Section>
  )
}

function Actions({ sel }: { sel: SelectionRef[] }) {
  const plan = useEditor((s) => s.plan) as Plan
  const hasItems = sel.some((s) => s.kind === 'item')
  const lockable = hasItems || sel.some((s) => s.kind === 'wall')
  const locked = allLocked(plan, sel)
  return (
    <div className="props-actions">
      {hasItems && (
        <button className="btn sm" disabled={!canRotate(plan, sel)} onClick={() => st().commit((p) => rotateSelection(p, sel, 90))} title="Rotate 90° (R)">
          <RotateCw size={13} /> Rotate
        </button>
      )}
      {lockable && (
        <button className="btn sm" aria-pressed={locked} onClick={() => st().commit((p) => toggleLock(p, sel))} title="Lock in place (⌘L)">
          {locked ? <LockOpen size={13} /> : <Lock size={13} />} {locked ? 'Unlock' : 'Lock'}
        </button>
      )}
      <button
        className="btn sm"
        title="Duplicate (⌘D)"
        onClick={() => {
          let next = sel
          st().commit((p) => void (next = duplicateSelection(p, sel, { x: 20, y: 20 })))
          st().setSelection(next)
        }}
      >
        <Copy size={13} /> Duplicate
      </button>
      <button
        className="btn sm"
        title="Delete (⌫)"
        onClick={() => {
          st().commit((p) => deleteSelection(p, sel))
        }}
      >
        <Trash2 size={13} /> Delete
      </button>
    </div>
  )
}

export function PropertiesPanel({ defs }: { defs: DefMap }) {
  const plan = useEditor((s) => s.plan) as Plan
  const selection = useEditor((s) => s.selection)

  let body: ReactNode
  if (selection.length === 0) body = <PlanProps plan={plan} />
  else if (selection.length > 1) body = <MultiPropsWithArrange sel={selection} />
  else {
    const s = selection[0]
    switch (s.kind) {
      case 'item':
        body = <ItemProps plan={plan} id={s.id} defs={defs} />
        break
      case 'wall':
        body = <WallProps plan={plan} id={s.id} />
        break
      case 'opening':
        body = <OpeningProps plan={plan} id={s.id} />
        break
      case 'label':
        body = <LabelProps plan={plan} id={s.id} />
        break
      case 'dimension':
        body = <DimensionProps plan={plan} id={s.id} />
        break
    }
  }
  return <aside className="props">{body}</aside>
}

function PlanProps({ plan }: { plan: Plan }) {
  const units = useUnits()
  const rooms = useMemo(() => detectRooms(plan.walls, plan.roomLabels), [plan.walls, plan.roomLabels])
  const total = rooms.reduce((s, r) => s + r.area, 0)
  const set = (mutate: (p: Plan) => void) => st().commit(mutate)
  return (
    <>
      <Section title="Plan">
        <Field label="Default wall thickness">
          <NumberInput value={plan.settings.defaultWallThickness} min={2} max={100} suffix="cm" onChange={(v) => set((p) => void (p.settings.defaultWallThickness = v))} />
        </Field>
        <Field label="Grid">
          <Segmented
            value={String(plan.settings.gridSize)}
            onChange={(v) => set((p) => void (p.settings.gridSize = Number(v)))}
            options={['5', '10', '25', '50'].map((v) => ({ value: v, label: `${v}` }))}
          />
        </Field>
        <label className="check">
          <input type="checkbox" checked={plan.settings.snap} onChange={(e) => set((p) => void (p.settings.snap = e.target.checked))} />
          Snap to grid and walls
        </label>
        <label className="check">
          <input type="checkbox" checked={plan.settings.showDims} onChange={(e) => set((p) => void (p.settings.showDims = e.target.checked))} />
          Show room dimensions
        </label>
        {plan.walls.length > 0 && (
          <button
            className="btn sm"
            title="Walls around a room get their thickness outside it, so their line is the room's inner face"
            onClick={() => set((p) => orientWalls(p, undefined, true))}
          >
            Put wall thickness outside rooms
          </button>
        )}
      </Section>
      <Section title="Rooms">
        {rooms.length === 0 ? (
          <p className="props-note">Close walls into a loop to create a room. The Room tool (B) draws one in a single drag.</p>
        ) : (
          <table className="props-table mono">
            <tbody>
              {rooms.map((r) => (
                <tr key={r.key}>
                  <td>{r.label?.name ?? 'Unnamed'}</td>
                  <td>{formatArea(r.area, units)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                <td>{formatArea(total, units)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Contents">
        <table className="props-table mono">
          <tbody>
            <tr>
              <td>Walls</td>
              <td>{plan.walls.length}</td>
            </tr>
            <tr>
              <td>Doors & windows</td>
              <td>{plan.openings.length}</td>
            </tr>
            <tr>
              <td>Furniture</td>
              <td>{plan.items.length}</td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  )
}

function MultiProps({ sel }: { sel: SelectionRef[] }) {
  const counts = sel.reduce<Record<string, number>>((m, s) => ((m[s.kind] = (m[s.kind] ?? 0) + 1), m), {})
  return (
    <Section title={`${sel.length} selected`}>
      <table className="props-table mono">
        <tbody>
          {Object.entries(counts).map(([k, n]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Actions sel={sel} />
    </Section>
  )
}

function MultiPropsWithArrange({ sel }: { sel: SelectionRef[] }) {
  return (
    <>
      <MultiProps sel={sel} />
      <Arrange sel={sel} />
    </>
  )
}

function ItemProps({ plan, id, defs }: { plan: Plan; id: string; defs: DefMap }) {
  const units = useUnits()
  const it = plan.items.find((i) => i.id === id)
  if (!it) return null
  const def = defs.get(it.defId) ?? FALLBACK_DEF
  const { w, d } = itemSize(it, def)
  const set = (mutate: (i: Item) => void) =>
    st().commit((p) => {
      const x = p.items.find((i) => i.id === id)
      if (x) mutate(x)
    })
  const resized = it.w !== undefined || it.d !== undefined
  return (
    <>
      <Section title={def.category}>
        <div className="props-heading">{def.name}</div>
        <Field label="Label">
          <input
            className="input"
            key={it.id}
            defaultValue={it.label ?? ''}
            placeholder="Optional text on the plan"
            onBlur={(e) => e.target.value !== (it.label ?? '') && set((i) => void (i.label = e.target.value || undefined))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Field>
      </Section>
      <fieldset className="props-lock" disabled={it.locked}>
        <Section title="Geometry">
          {it.locked && <p className="props-note">Locked. Unlock it (⌘L) to move or resize it.</p>}
          <Row>
            <Field label="X">
              <NumberInput value={it.x} suffix="cm" onChange={(v) => set((i) => void (i.x = v))} />
            </Field>
            <Field label="Y">
              <NumberInput value={it.y} suffix="cm" onChange={(v) => set((i) => void (i.y = v))} />
            </Field>
          </Row>
          <Row>
            <Field label="Width">
              <NumberInput value={w} min={1} suffix="cm" onChange={(v) => set((i) => void (i.w = v))} />
            </Field>
            <Field label="Depth">
              <NumberInput value={d} min={1} suffix="cm" onChange={(v) => set((i) => void (i.d = v))} />
            </Field>
          </Row>
          <Field label="Rotation">
            <NumberInput value={it.rotation} min={-180} max={180} step={15} suffix="°" onChange={(v) => set((i) => void (i.rotation = v))} />
          </Field>
          {resized && (
            <button
              className="btn sm ghost"
              onClick={() =>
                set((i) => {
                  delete i.w
                  delete i.d
                })
              }
            >
              Reset to {formatLength(def.width, units)} × {formatLength(def.depth, units)}
            </button>
          )}
        </Section>
      </fieldset>
      <Arrange sel={[{ kind: 'item', id }]} />
      <Actions sel={[{ kind: 'item', id }]} />
    </>
  )
}

function WallProps({ plan, id }: { plan: Plan; id: string }) {
  const units = useUnits()
  const w = plan.walls.find((x) => x.id === id)
  if (!w) return null
  const length = wallLength(w)
  const arc = wallArc(w)
  const sweep = sweepOf(w)
  const openings = plan.openings.filter((o) => o.wallId === id).length
  const set = (mutate: (w: Wall) => void) =>
    st().commit((p) => {
      mutate(p.walls.find((q) => q.id === id)!)
      clampOpenings(p)
    })
  const setSweep = (deg: number) =>
    set((x) => {
      const b = bulgeForSweep(deg)
      if (Math.abs(b) < 1e-4) delete x.bulge
      else x.bulge = b
    })
  const align = w.align ?? 'center'
  const curve = !arc ? 'straight' : Math.abs(Math.abs(sweep) - 90) < 0.5 ? 'quarter' : Math.abs(Math.abs(sweep) - 180) < 0.5 ? 'half' : 'custom'
  const side = Math.sign(sweep) || 1
  return (
    <>
      {/* A disabled fieldset turns off every control inside it. */}
      <fieldset className="props-lock" disabled={w.locked}>
        <Section title={arc ? 'Curved wall' : 'Wall'}>
          {w.locked && <p className="props-note">Locked. Unlock it (⌘L) to change its shape.</p>}
          <Row>
            {arc ? (
              <Field label="Radius">
                <NumberInput
                  value={arc.r}
                  min={Math.ceil(dist(w.a, w.b) / 2)}
                  suffix="cm"
                  onChange={(r) =>
                    set((x) => {
                      // Keep the side and whether it is the long way round.
                      const c = dist(x.a, x.b)
                      const h = Math.sqrt(Math.max(0, r * r - (c * c) / 4))
                      const sagitta = Math.abs(sweepOf(x)) > 180 ? r + h : r - h
                      x.bulge = Math.sign(x.bulge ?? 1) * ((2 * sagitta) / c)
                    })
                  }
                />
              </Field>
            ) : (
              <Field label="Length">
                <NumberInput
                  value={length}
                  min={1}
                  suffix="cm"
                  onChange={(v) =>
                    st().commit((p) => {
                      const x = p.walls.find((q) => q.id === id)!
                      const dir = norm(sub(x.b, x.a))
                      moveJoint(p, x.b, add(x.a, scale(dir, v)))
                    })
                  }
                />
              </Field>
            )}
            <Field label="Thickness">
              <NumberInput value={w.thickness} min={2} max={100} suffix="cm" onChange={(v) => set((x) => void (x.thickness = v))} />
            </Field>
          </Row>
          <Field label="Thickness side">
            <Segmented
              value={align === 'center' ? 'center' : 'side'}
              onChange={(v) => set((x) => void (x.align = v === 'center' ? 'center' : 'left'))}
              options={[
                { value: 'side', label: 'One side' },
                { value: 'center', label: 'Centred' },
              ]}
            />
          </Field>
          {align !== 'center' && (
            <button className="btn sm" onClick={() => set((x) => void (x.align = flipAlign(x.align)))} title="Flip thickness side (F)">
              <FlipVertical2 size={13} /> Flip to other side
            </button>
          )}
        </Section>
        <Section title="Curve">
          <Segmented
            value={curve}
            onChange={(v) => {
              if (v === 'straight') setSweep(0)
              else if (v === 'quarter') setSweep(90 * side)
              else if (v === 'half') setSweep(180 * side)
              else setSweep((curve === 'straight' ? 45 : Math.abs(sweep)) * side)
            }}
            options={[
              { value: 'straight', label: 'Straight' },
              { value: 'quarter', label: '¼ circle' },
              { value: 'half', label: '½ circle' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {arc && (
            <>
              <Field label="Sweep">
                <NumberInput value={Math.abs(sweep)} min={1} max={330} suffix="°" onChange={(v) => setSweep(v * side)} />
              </Field>
              <button className="btn sm" onClick={() => setSweep(-sweep)}>
                <FlipHorizontal2 size={13} /> Bulge the other way
              </button>
            </>
          )}
          {!arc && <p className="props-note">Or drag the round handle in the middle of the wall. Curved walls (A) draws arcs directly.</p>}
        </Section>
      </fieldset>
      <Section title="Details">
        <table className="props-table mono">
          <tbody>
            {arc && (
              <tr>
                <td>Arc length</td>
                <td>{formatLength(length, units, true)}</td>
              </tr>
            )}
            <tr>
              <td>{arc ? 'Chord angle' : 'Angle'}</td>
              <td>{Math.round(angleDeg(w.a, w.b) * 10) / 10}°</td>
            </tr>
            <tr>
              <td>Start</td>
              <td>
                {Math.round(w.a.x)}, {Math.round(w.a.y)}
              </td>
            </tr>
            <tr>
              <td>End</td>
              <td>
                {Math.round(w.b.x)}, {Math.round(w.b.y)}
              </td>
            </tr>
            <tr>
              <td>Openings</td>
              <td>{openings}</td>
            </tr>
          </tbody>
        </table>
        <button
          className="btn sm"
          onClick={() =>
            st().commit((p) => {
              for (const x of p.walls) if (x.id !== id && !x.locked) x.thickness = w.thickness
              clampOpenings(p)
            })
          }
        >
          Apply thickness to all walls
        </button>
      </Section>
      <Actions sel={[{ kind: 'wall', id }]} />
    </>
  )
}

function OpeningProps({ plan, id }: { plan: Plan; id: string }) {
  const o = plan.openings.find((x) => x.id === id)
  const w = o && plan.walls.find((x) => x.id === o.wallId)
  if (!o || !w) return null
  const l = wallLength(w)
  const set = (mutate: (o: Opening) => void) =>
    st().commit((p) => {
      const x = p.openings.find((q) => q.id === id)!
      mutate(x)
      x.width = Math.min(x.width, l)
      x.offset = clampOpeningOffset(w, x.width, x.offset)
    })
  const isDoor = o.kind !== 'window' && o.kind !== 'passage'
  return (
    <>
      <Section title={OPENING_LABEL[o.kind]}>
        <Field label="Type">
          <select className="select" value={o.kind} onChange={(e) => set((x) => void (x.kind = e.target.value as OpeningKind))}>
            {(Object.keys(OPENING_LABEL) as OpeningKind[]).map((k) => (
              <option key={k} value={k}>
                {OPENING_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Row>
          <Field label="Width">
            <NumberInput value={o.width} min={20} max={l} suffix="cm" onChange={(v) => set((x) => void (x.width = v))} />
          </Field>
          <Field label="From start">
            <NumberInput
              value={o.offset - o.width / 2}
              min={0}
              suffix="cm"
              onChange={(v) => set((x) => void (x.offset = v + x.width / 2))}
            />
          </Field>
        </Row>
        {isDoor && (
          <div className="props-actions">
            <button className="btn sm" onClick={() => set((x) => void (x.flipSide = !x.flipSide))} title="Flip swing side (F)">
              <FlipVertical2 size={13} /> Flip side
            </button>
            {(o.kind === 'door' || o.kind === 'pocket-door') && (
              <button className="btn sm" onClick={() => set((x) => void (x.flipHinge = !x.flipHinge))} title="Flip hinge (⇧F)">
                <FlipHorizontal2 size={13} /> Flip hinge
              </button>
            )}
          </div>
        )}
        <p className="props-note">Drag along the wall to move it, or onto another wall to rehang it.</p>
      </Section>
      <Actions sel={[{ kind: 'opening', id }]} />
    </>
  )
}

function LabelProps({ plan, id }: { plan: Plan; id: string }) {
  const units = useUnits()
  const l = plan.roomLabels.find((x) => x.id === id)
  const rooms = useMemo(() => detectRooms(plan.walls, plan.roomLabels), [plan.walls, plan.roomLabels])
  if (!l) return null
  const room = rooms.find((r) => r.label?.id === id)
  return (
    <>
      <Section title="Room label">
        <Field label="Name">
          <input
            className="input"
            key={l.id}
            autoFocus
            defaultValue={l.name}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              const name = e.target.value.trim() || 'Room'
              if (name !== l.name)
                st().commit((p) => {
                  p.roomLabels.find((x) => x.id === id)!.name = name
                })
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Field>
        <table className="props-table mono">
          <tbody>
            <tr>
              <td>Area</td>
              <td>{room ? formatArea(room.area, units) : 'Not inside a room'}</td>
            </tr>
          </tbody>
        </table>
      </Section>
      <Actions sel={[{ kind: 'label', id }]} />
    </>
  )
}

function DimensionProps({ plan, id }: { plan: Plan; id: string }) {
  const units = useUnits()
  const dm = plan.dimensions.find((x) => x.id === id)
  if (!dm) return null
  return (
    <>
      <Section title="Dimension">
        <table className="props-table mono">
          <tbody>
            <tr>
              <td>Length</td>
              <td>{formatLength(dist(dm.a, dm.b), units, true)}</td>
            </tr>
          </tbody>
        </table>
        <Field label="Offset">
          <NumberInput
            value={dm.offset}
            suffix="cm"
            onChange={(v) =>
              st().commit((p) => {
                p.dimensions.find((x) => x.id === id)!.offset = v
              })
            }
          />
        </Field>
      </Section>
      <Actions sel={[{ kind: 'dimension', id }]} />
    </>
  )
}
