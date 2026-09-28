import { createContext, useContext } from 'react'

export type ThemeId = 'paper' | 'black' | 'blueprint'

/** Colours the plan drawing is made of. The UI chrome uses the matching CSS variables. */
export interface PlanColors {
  ink: string
  paper: string
  muted: string
  gridMinor: string
  gridMajor: string
  axis: string
}

export const THEMES: Record<ThemeId, { label: string; plan: PlanColors }> = {
  paper: {
    label: 'Paper',
    plan: { ink: '#000000', paper: '#ffffff', muted: '#737373', gridMinor: '#efefef', gridMajor: '#dedede', axis: '#bdbdbd' },
  },
  black: {
    label: 'Black',
    plan: { ink: '#f2f2f2', paper: '#0b0b0b', muted: '#8f8f8f', gridMinor: '#171717', gridMajor: '#272727', axis: '#4d4d4d' },
  },
  blueprint: {
    label: 'Blueprint',
    plan: { ink: '#eaf2ff', paper: '#1b4d8e', muted: '#a9c2e2', gridMinor: '#22599c', gridMajor: '#3268ad', axis: '#7196c9' },
  },
}

export const THEME_IDS = Object.keys(THEMES) as ThemeId[]

export const PlanColorsContext = createContext<PlanColors>(THEMES.paper.plan)
export const usePlanColors = () => useContext(PlanColorsContext)
