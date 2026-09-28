import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { useTheme } from '../theme/themeStore'
import { THEMES, THEME_IDS } from '../theme/themes'
import { formatLength, parseLength } from '../units/units'
import { useUnits } from '../units/unitsStore'

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

/**
 * Numeric input that commits on blur/Enter so typing intermediate values
 * does not spam the undo history. A `suffix="cm"` marks a length: it shows and
 * reads in the app's units (feet-inches when imperial) while values stay in cm.
 */
export function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
  precision = 0,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
  min?: number
  max?: number
  step?: number
  precision?: number
}) {
  const units = useUnits()
  const imperial = suffix === 'cm' && units === 'imperial'
  const fmt = (v: number) => (!Number.isFinite(v) ? '' : imperial ? formatLength(v, units) : String(Number(v.toFixed(precision))))
  const parse = (s: string) => parseLength(s, imperial ? units : 'metric')
  const [draft, setDraft] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(fmt(value))
  }, [value, focused, imperial])
  const commit = () => {
    const v = parse(draft)
    // Untouched text is left alone: imperial display is rounded and would nudge the value.
    if (v === null || draft === fmt(value)) {
      setDraft(fmt(value))
      return
    }
    let next = v
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    if (next !== value) onChange(next)
    setDraft(fmt(next))
  }
  return (
    <div className="input-wrap">
      <input
        className="input num"
        inputMode="decimal"
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            // Imperial lengths step by the inch, or the foot with shift.
            const k = (imperial ? (e.shiftKey ? 12 : 1) * 2.54 : (e.shiftKey ? 10 : 1) * step) * (e.key === 'ArrowUp' ? 1 : -1)
            const next = (parse(draft) ?? value) + k
            setDraft(fmt(next))
            onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next)))
          }
        }}
      />
      {suffix && !imperial && <span className="suffix">{suffix}</span>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Toast ---------- */
const useToastStore = create<{ message: string | null; show: (m: string) => void }>((set) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    message: null,
    show(message) {
      clearTimeout(timer)
      set({ message })
      timer = setTimeout(() => set({ message: null }), 2200)
    },
  }
})

export const toast = (m: string) => useToastStore.getState().show(m)

export function Toaster() {
  const message = useToastStore((s) => s.message)
  return message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null
}

/* ---------- Confirm ---------- */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  )
}

/* ---------- Theme picker ---------- */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="theme-pick" role="group" aria-label="Colour theme">
      {THEME_IDS.map((t) => (
        <button
          key={t}
          type="button"
          title={`${THEMES[t].label} theme`}
          aria-label={`${THEMES[t].label} theme`}
          aria-pressed={theme === t}
          onClick={() => setTheme(t)}
          style={{ background: THEMES[t].plan.paper, ['--swatch-ink' as string]: THEMES[t].plan.ink } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
