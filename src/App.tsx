import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Dashboard } from './pages/Dashboard'
import { ComponentsPage } from './pages/Components'
import { EditorPage } from './pages/editor/Editor'
import { PrivacyPage, TermsPage } from './pages/Legal'
import { AboutPage } from './pages/About'
import { usePlans } from './store/plansStore'
import { useComponents } from './store/componentsStore'
import { Toaster } from './ui'
import { useTheme } from './theme/themeStore'
import { useSync } from './sync/syncStore'
import { PlanColorsContext, THEMES } from './theme/themes'

const OutputPage = lazy(() => import('./pages/Output').then((m) => ({ default: m.OutputPage })))

export function App() {
  const loadPlans = usePlans((s) => s.load)
  const loadComponents = useComponents((s) => s.load)
  useEffect(() => {
    // Sync compares against local data, so it starts once that has loaded.
    void Promise.all([loadPlans(), loadComponents()]).then(() => useSync.getState().init())
  }, [loadPlans, loadComponents])

  const theme = useTheme((s) => s.theme)

  return (
    <PlanColorsContext.Provider value={THEMES[theme].plan}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/components" element={<ComponentsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/plan/:id" element={<EditorPage />} />
        <Route
          path="/plan/:id/output"
          element={
            <Suspense fallback={<div className="editor-msg mono">Loading…</div>}>
              <OutputPage />
            </Suspense>
          }
        />
      </Routes>
      <Toaster />
    </BrowserRouter>
    </PlanColorsContext.Provider>
  )
}
