export type Units = 'metric' | 'imperial'

const CM_PER_IN = 2.54
const SQFT_PER_M2 = 10.7639

/**
 * A length in cm for display. Metric is whole cm (bare unless `withUnit`);
 * imperial is feet-inches to the nearest half inch, e.g. 12' 6½".
 */
export function formatLength(cm: number, units: Units, withUnit = false): string {
  if (units === 'metric') return `${Math.round(cm)}${withUnit ? ' cm' : ''}`
  const halves = Math.round((Math.abs(cm) / CM_PER_IN) * 2)
  const ft = Math.floor(halves / 24)
  const inch = `${Math.floor((halves % 24) / 2)}${halves % 2 ? '½' : ''}"`
  return `${cm < 0 && halves ? '-' : ''}${ft ? `${ft}' ` : ''}${inch}`
}

/** An area in m² for display; imperial drops one decimal since ft² run ~10× larger. */
export function formatArea(m2: number, units: Units, digits = 2): string {
  return units === 'metric' ? `${m2.toFixed(digits)} m²` : `${(m2 * SQFT_PER_M2).toFixed(Math.max(0, digits - 1))} ft²`
}

const NUM = String.raw`(\d+(?:\.\d*)?|\.\d+)`
const IMPERIAL = new RegExp(String.raw`^(-)?\s*(?:${NUM}\s*(?:'|ft)\s*)?(?:${NUM}?\s*(½)?\s*(?:"|in)?)?$`)

/**
 * Parses typed length input to cm, or null when unreadable. Metric takes plain cm;
 * imperial takes inches or feet-inches: 150, 150", 12', 12.5ft, 12'6", 12' 6½".
 */
export function parseLength(text: string, units: Units): number | null {
  const s = text.trim()
  if (!s) return null
  if (units === 'metric') {
    const v = Number(s)
    return Number.isFinite(v) ? v : null
  }
  const m = IMPERIAL.exec(s.replace(/''/g, '"'))
  if (!m || (m[2] === undefined && m[3] === undefined && !m[4])) return null
  const inches = Number(m[2] ?? 0) * 12 + Number(m[3] ?? 0) + (m[4] ? 0.5 : 0)
  return (m[1] ? -inches : inches) * CM_PER_IN
}
