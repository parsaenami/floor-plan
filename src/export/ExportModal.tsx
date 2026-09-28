import { useMemo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Plan } from '../model/types'
import { detectRooms } from '../geometry/rooms'
import { slug } from '../persistence/importExport'
import type { DefMap } from '../render/planGeometry'
import { Field, Modal, Segmented, toast } from '../ui'
import { SCALES, Sheet, bestScale, fitsAt, sheetSize, type Orientation, type Paper, type SheetOptions } from './Sheet'
import { THEMES, THEME_IDS, type ThemeId } from '../theme/themes'
import { useUnitsStore } from '../units/unitsStore'
import './export.css'

type Format = 'pdf' | 'png' | 'svg' | 'dxf'

export function ExportModal({ plan, defs, onClose }: { plan: Plan; defs: DefMap; onClose: () => void }) {
  const rooms = useMemo(() => detectRooms(plan.walls, plan.roomLabels), [plan.walls, plan.roomLabels])
  const [opts, setOpts] = useState<SheetOptions>(() => {
    const base = {
      paper: 'A4' as Paper,
      orientation: 'landscape' as Orientation,
      title: plan.name,
      showDims: plan.settings.showDims,
      theme: 'paper' as ThemeId,
    }
    return { ...base, scale: bestScale(plan, defs, base) }
  })
  const [busy, setBusy] = useState<Format | null>(null)
  const [cad, setCad] = useState(false)
  const set = (patch: Partial<SheetOptions>) =>
    setOpts((o) => {
      const next = { ...o, ...patch }
      // Re-pick the scale when the sheet changes and the current one no longer fits.
      if (('paper' in patch || 'orientation' in patch) && !fitsAt(plan, defs, next)) next.scale = bestScale(plan, defs, next)
      return next
    })

  const fits = fitsAt(plan, defs, opts)
  const { w, h } = sheetSize(opts)

  async function run(format: Format) {
    setBusy(format)
    try {
      const { exportDxf, exportPdf, exportPng, exportSvg } = await import('./exporters')
      if (format === 'dxf') await exportDxf(plan, defs, rooms, useUnitsStore.getState().units, `${slug(opts.title)}.dxf`)
      else {
        const svg = renderToStaticMarkup(<Sheet plan={plan} defs={defs} rooms={rooms} options={opts} />)
        const name = `${slug(opts.title)}-1-${opts.scale}`
        if (format === 'svg') await exportSvg(svg, `${name}.svg`)
        if (format === 'png') await exportPng(svg, w, h, 200, `${name}.png`)
        if (format === 'pdf') await exportPdf(svg, w, h, `${name}.pdf`)
      }
      toast(`Exported ${format.toUpperCase()}`)
    } catch (e) {
      console.error(e)
      toast(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title="Export sheet" onClose={onClose} wide>
      <div className="export">
        <div className="export-preview">
          <div className="export-paper" style={{ aspectRatio: `${w} / ${h}` }}>
            <Sheet plan={plan} defs={defs} rooms={rooms} options={opts} />
          </div>
        </div>
        <div className="export-opts">
          <Field label="Title">
            <input className="input" value={opts.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Output">
            <Segmented
              value={cad ? 'cad' : 'sheet'}
              onChange={(v) => setCad(v === 'cad')}
              options={[
                { value: 'sheet', label: 'Sheet' },
                { value: 'cad', label: 'CAD (DXF)' },
              ]}
            />
          </Field>
          {cad ? (
            <p className="export-fit mono">1:1 model space in centimetres. Layers: WALLS, OPENINGS, FURNITURE, ROOMS, DIMENSIONS.</p>
          ) : (
            <>
              <Field label="Paper">
                <Segmented value={opts.paper} onChange={(paper) => set({ paper })} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]} />
              </Field>
              <Field label="Orientation">
                <Segmented
                  value={opts.orientation}
                  onChange={(orientation) => set({ orientation })}
                  options={[
                    { value: 'landscape', label: 'Landscape' },
                    { value: 'portrait', label: 'Portrait' },
                  ]}
                />
              </Field>
              <Field label="Scale">
                <Segmented
                  value={String(opts.scale)}
                  onChange={(v) => set({ scale: Number(v) })}
                  options={SCALES.map((s) => ({ value: String(s), label: `1:${s}` }))}
                />
              </Field>
              <Field label="Colours">
                <Segmented
                  value={opts.theme}
                  onChange={(theme) => set({ theme })}
                  options={THEME_IDS.map((t) => ({ value: t, label: THEMES[t].label }))}
                />
              </Field>
              <p className={`export-fit mono${fits ? '' : ' bad'}`}>{fits ? 'Drawing fits the sheet' : 'Too large for this sheet — pick a smaller scale or larger paper'}</p>
              <label className="check">
                <input type="checkbox" checked={opts.showDims} onChange={(e) => set({ showDims: e.target.checked })} />
                Room dimensions
              </label>
            </>
          )}
          <div className="export-actions">
            {cad ? (
              <button className="btn primary block" disabled={!!busy} onClick={() => run('dxf')}>
                {busy === 'dxf' ? 'Exporting…' : 'Download DXF'}
              </button>
            ) : (
              <>
                <button className="btn primary block" disabled={!!busy} onClick={() => run('pdf')}>
                  {busy === 'pdf' ? 'Exporting…' : 'Download PDF'}
                </button>
                <div className="export-row">
                  <button className="btn block" disabled={!!busy} onClick={() => run('png')}>
                    PNG
                  </button>
                  <button className="btn block" disabled={!!busy} onClick={() => run('svg')}>
                    SVG
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
