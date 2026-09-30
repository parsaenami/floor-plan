import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PlanColors } from '../theme/themes'
import { WALL_HEIGHT, type Scene3D, type Solid, type SolidKind } from './scene'

/** Straight-down views flip the orbit; stop just short of the pole. */
const MAX_POLAR = Math.PI / 2 - 0.05

function prism(s: Solid): THREE.BufferGeometry {
  // The shape lives in the xy plane; mirroring y and tipping it up puts plan y on world z, extruded up world y.
  const shape = new THREE.Shape(s.footprint.map((p) => new THREE.Vector2(p.x, -p.y)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: s.z1 - s.z0, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, s.z0, 0)
  return geo
}

function materials(c: PlanColors): Record<SolidKind, THREE.Material> {
  const paper = new THREE.Color(c.paper)
  const tint = (k: number) => paper.clone().lerp(new THREE.Color(c.ink), k)
  return {
    wall: new THREE.MeshLambertMaterial({ color: tint(0.08) }),
    floor: new THREE.MeshLambertMaterial({ color: tint(0.16) }),
    item: new THREE.MeshLambertMaterial({ color: tint(0.3) }),
    glass: new THREE.MeshLambertMaterial({ color: new THREE.Color(c.muted), transparent: true, opacity: 0.25, depthWrite: false }),
  }
}

/** Orbitable 3D model of the plan: light solids with ink edges, on the theme's paper. */
export default function Viewer({ scene, colors }: { scene: Scene3D; colors: PlanColors }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const world = new THREE.Scene()
    world.background = new THREE.Color(colors.paper)
    world.add(new THREE.HemisphereLight(0xffffff, 0x808080, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(-0.5, 1, 0.3)
    world.add(sun)

    const mats = materials(colors)
    const edgeMat = new THREE.LineBasicMaterial({ color: colors.ink })
    const disposables: { dispose(): void }[] = [renderer, edgeMat, ...Object.values(mats)]
    for (const s of scene.solids) {
      const geo = prism(s)
      const mesh = new THREE.Mesh(geo, mats[s.kind])
      // Glass draws after the solids it sits between.
      if (s.kind === 'glass') mesh.renderOrder = 1
      world.add(mesh)
      const edges = new THREE.EdgesGeometry(geo, 20)
      world.add(new THREE.LineSegments(edges, edgeMat))
      disposables.push(geo, edges)
    }

    const b = scene.bounds ?? { min: { x: -250, y: -250 }, max: { x: 250, y: 250 } }
    const center = new THREE.Vector3((b.min.x + b.max.x) / 2, WALL_HEIGHT / 2, (b.min.y + b.max.y) / 2)
    const radius = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, WALL_HEIGHT) / 2
    const camera = new THREE.PerspectiveCamera(40, 1, 1, radius * 40)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping = true
    controls.maxPolarAngle = MAX_POLAR
    controls.minDistance = 50
    controls.maxDistance = radius * 12
    disposables.push(controls)

    /** Back the camera off until the whole plan fits the narrower of the two fields of view. */
    const frame = () => {
      const vFov = THREE.MathUtils.degToRad(camera.fov)
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
      const distance = radius / Math.sin(Math.min(vFov, hFov) / 2)
      camera.position.copy(center).add(new THREE.Vector3(-0.45, 0.7, 0.55).normalize().multiplyScalar(distance))
      controls.update()
    }

    let framed = false
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (!framed) frame()
      framed = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(world, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      for (const d of disposables) d.dispose()
      renderer.domElement.remove()
    }
  }, [scene, colors])

  return <div ref={host} className="viewer3d" />
}
