import { defineChart } from '@tanstack/charts'
import { geoShape } from '@tanstack/charts/geo'
import { Chart } from '@tanstack/charts/react'
import { tooltip } from '@tanstack/charts/tooltip'
import { geoIdentity, geoPath } from 'd3-geo'
import { ArrowLeft, FileJson } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { detectRooms } from '../geometry/rooms'
import { downloadJson, slug } from '../persistence/importExport'
import { toGeoJSON, type PlanFeature } from '../render/toGeoJSON'
import { useDefMap } from '../store/componentsStore'
import { usePlans } from '../store/plansStore'
import { usePlanColors } from '../theme/themes'
import './output.css'

const planar = geoPath()

export function OutputPage() {
  const { id } = useParams()
  const loaded = usePlans((s) => s.loaded)
  const plan = usePlans((s) => s.plans.find((p) => p.id === id))
  const defs = useDefMap()
  const colors = usePlanColors()
  const hostRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setHeight(Math.floor(e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [plan?.id])

  const collection = useMemo(() => {
    if (!plan) return null
    return toGeoJSON(plan, defs, detectRooms(plan.walls, plan.roomLabels), colors)
  }, [plan, defs, colors])

  const definition = useMemo(() => {
    if (!collection) return null
    const features: PlanFeature[] = collection.features
    return defineChart({
      marks: [
        geoShape(features, {
          key: (f) => f.properties.id,
          projection: { type: () => geoIdentity().reflectY(true), fit: collection, inset: 24 },
          fill: (f) => f.properties.fill,
          stroke: (f) => f.properties.stroke,
          strokeWidth: 1,
          anchor: (f) => planar.centroid(f) as [number, number],
        }),
      ],
      scales: { x: null, y: null },
      margin: 8,
      tooltip: {
        use: tooltip,
        format: (point) => `${point.datum.properties.name}\n${point.datum.properties.detail}`,
      },
    })
  }, [collection])

  if (!loaded) return <div className="output-msg mono">Loading…</div>
  if (!plan || !collection || !definition)
    return (
      <div className="output-msg">
        <p>This plan doesn’t exist.</p>
        <Link to="/" className="btn">
          Back to plans
        </Link>
      </div>
    )

  const counts = collection.features.reduce<Record<string, Set<string>>>((m, f) => {
    const owner = f.properties.id.split(':').slice(0, 2).join(':')
    ;(m[f.properties.kind] ??= new Set()).add(owner)
    return m
  }, {})

  return (
    <div className="output">
      <header className="topbar">
        <Link to={`/plan/${plan.id}`} className="icon-btn" title="Back to editor">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <div className="eyebrow">Output · GeoJSON</div>
          <div className="output-title">{plan.name}</div>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => downloadJson(collection, `${slug(plan.name)}.geojson`)}>
          <FileJson size={14} /> Download GeoJSON
        </button>
      </header>
      <div className="output-body">
        <div className="output-chart" ref={hostRef}>
          {height > 0 && <Chart definition={definition} height={height} ariaLabel={`Floor plan of ${plan.name}`} />}
        </div>
        <aside className="output-side">
          <div className="eyebrow">Features</div>
          <table className="props-table mono">
            <tbody>
              {(['room', 'wall', 'opening', 'item'] as const).map((k) => (
                <tr key={k}>
                  <td>{{ room: 'Rooms', wall: 'Walls', opening: 'Doors & windows', item: 'Furniture' }[k]}</td>
                  <td>{counts[k]?.size ?? 0}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Geometries</td>
                <td>{collection.features.length}</td>
              </tr>
            </tbody>
          </table>
          <p className="output-note">
            Planar coordinates in centimetres, y pointing up. Rendered with TanStack Charts <code>geoShape</code> through an identity projection. Hover
            any shape for details.
          </p>
        </aside>
      </div>
    </div>
  )
}
