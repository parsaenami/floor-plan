import { create } from 'zustand'
import { THEMES, type ThemeId } from './themes'

const KEY = 'floor-plan-studio:theme'

function stored(): ThemeId {
  try {
    const v = localStorage.getItem(KEY)
    if (v && v in THEMES) return v as ThemeId
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return 'paper'
}

const apply = (theme: ThemeId) => {
  document.documentElement.dataset.theme = theme
}

export const useTheme = create<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>((set) => {
  const theme = stored()
  apply(theme)
  return {
    theme,
    setTheme(theme) {
      apply(theme)
      try {
        localStorage.setItem(KEY, theme)
      } catch {
        // Not persisted; the choice still applies for this session.
      }
      set({ theme })
    },
  }
})
