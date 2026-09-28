import { CopyPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { ComponentDef, Plan } from '../model/types'
import { decodeShare, mergeShared, shareUrl } from '../persistence/share'
import { PlanThumb } from '../render/PlanThumb'
import { useComponents, useDefMap } from '../store/componentsStore'
import { usePlans } from '../store/plansStore'
import { toast } from '../ui'
import './output.css'

export async function copyShareLink(plan: Plan, custom: ComponentDef[]) {
  try {
    await navigator.clipboard.writeText(await shareUrl(plan, custom))
    toast('Share link copied')
  } catch {
    toast('Could not copy the link')
  }
}

type Shared = { plan: Plan; components: ComponentDef[] }

export function SharePage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const defs = useDefMap()
  const loaded = useComponents((s) => s.loaded)
  const [shared, setShared] = useState<Shared | Error | null>(null)

  useEffect(() => {
    let live = true
    decodeShare(hash.slice(1)).then(
      (s) => live && setShared(s),
      (e) => live && setShared(e instanceof Error ? e : new Error('This link is incomplete or broken.')),
    )
    return () => void (live = false)
  }, [hash])

  // Shared components win over local ones for display, so the plan looks as it was sent.
  const view = useMemo(() => {
    if (!shared || shared instanceof Error) return defs
    return new Map([...defs, ...shared.components.map((c) => [c.id, c] as const)])
  }, [defs, shared])

  if (shared instanceof Error)
    return (
      <div className="output-msg">
        <p>{shared.message}</p>
        <Link to="/" className="btn">
          Go to your plans
        </Link>
      </div>
    )
  if (!shared) return <div className="output-msg mono">Loading…</div>

  const { plan: sharedPlan, components: sharedComponents } = shared
  const save = async () => {
    const { plan, components } = mergeShared(sharedPlan, sharedComponents, defs)
    if (components.length) await useComponents.getState().upsertMany(components)
    await usePlans.getState().upsert(plan)
    toast(`Saved “${plan.name}”`)
    navigate(`/plan/${plan.id}`)
  }

  return (
    <div className="output">
      <header className="topbar">
        <Link to="/" className="brand" title="Floor Plan Studio">
          <span className="brand-mark" />
        </Link>
        <div>
          <div className="eyebrow">Shared plan · read-only</div>
          <div className="output-title">{sharedPlan.name}</div>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={save} disabled={!loaded}>
          <CopyPlus size={14} /> Save a copy
        </button>
      </header>
      <div className="output-chart share-view">
        <PlanThumb plan={sharedPlan} defs={view} width={1200} height={800} />
      </div>
    </div>
  )
}
