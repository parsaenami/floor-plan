import { NavLink } from 'react-router'
import { useComponents } from '../store/componentsStore'
import { usePlans } from '../store/plansStore'
import './dashboard.css'

const count = (n: number) => String(n).padStart(2, '0')

/** Title row shared by the dashboard and the component library: Plans | Components tabs plus counts. */
export function DashHead() {
  const plans = usePlans((s) => s.plans.length)
  const components = useComponents((s) => s.custom.length)
  return (
    <div className="dash-head">
      <div>
        <div className="eyebrow">Dashboard</div>
        <nav className="dash-tabs" aria-label="Dashboard">
          <NavLink to="/" end>
            Plans
          </NavLink>
          <NavLink to="/components">Components</NavLink>
        </nav>
      </div>
      <div className="dash-stats mono">
        <span>{count(plans)} plans</span>
        <span>{count(components)} custom components</span>
      </div>
    </div>
  )
}
