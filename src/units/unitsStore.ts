import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import type { Units } from './units'

const KEY = 'floor-plan-studio:units'

function stored(): Units {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'metric' || v === 'imperial') return v
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return 'metric'
}

/** App-wide display units; plans are always stored in cm. */
export const useUnitsStore = create<{ units: Units; setUnits: (u: Units) => void }>((set) => ({
  units: stored(),
  setUnits(units) {
    try {
      localStorage.setItem(KEY, units)
    } catch {
      // Not persisted; the choice still applies for this session.
    }
    set({ units })
  },
}))

const get = () => useUnitsStore.getState().units
/** Current units. Static renders (the export sheet) read the live value too, not the initial one. */
export const useUnits = () => useSyncExternalStore(useUnitsStore.subscribe, get, get)
