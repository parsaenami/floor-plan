import { lazy, Suspense, useMemo } from 'react'
import type { Plan } from '../model/types'
import type { DefMap } from '../render/planGeometry'
import { usePlanColors } from '../theme/themes'
import { Modal } from '../ui'
import { planScene } from './scene'
import './preview3d.css'

// three.js is large; only load it when someone opens the preview.
const Viewer = lazy(() => import('./Viewer'))

export function Preview3DModal({ plan, defs, onClose }: { plan: Plan; defs: DefMap; onClose: () => void }) {
  const colors = usePlanColors()
  const scene = useMemo(() => planScene(plan, defs), [plan, defs])
  return (
    <Modal title="3D preview" onClose={onClose} wide>
      <div className="preview3d">
        {scene.solids.length ? (
          <Suspense fallback={<div className="preview3d-msg mono">Loading…</div>}>
            <Viewer scene={scene} colors={colors} />
          </Suspense>
        ) : (
          <div className="preview3d-msg">Draw some walls to see them in 3D.</div>
        )}
      </div>
      <p className="preview3d-hint mono">Drag to orbit · right-drag to pan · scroll to zoom</p>
    </Modal>
  )
}
