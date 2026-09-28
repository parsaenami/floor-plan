import { nanoid } from 'nanoid'
import type { Item, Opening, OpeningKind, Plan, PlanSettings, Pt, RoomLabel, Wall } from './types'

export const uid = () => nanoid(10)

export const DEFAULT_SETTINGS: PlanSettings = {
  gridSize: 10,
  snap: true,
  showDims: true,
  defaultWallThickness: 15,
}

export const DEFAULT_OPENING_WIDTH: Record<OpeningKind, number> = {
  door: 90,
  'double-door': 150,
  'sliding-door': 180,
  'pocket-door': 90,
  'bifold-door': 120,
  passage: 100,
  window: 120,
}

export const OPENING_LABEL: Record<OpeningKind, string> = {
  door: 'Door',
  'double-door': 'Double door',
  'sliding-door': 'Sliding door',
  'pocket-door': 'Pocket door',
  'bifold-door': 'Bifold door',
  passage: 'Open passage',
  window: 'Window',
}

export function newPlan(name: string): Plan {
  const now = Date.now()
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    walls: [],
    openings: [],
    items: [],
    roomLabels: [],
    dimensions: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

/** A small two-room apartment used as a starting template. */
export function samplePlan(name: string): Plan {
  const plan = newPlan(name)
  const w = (ax: number, ay: number, bx: number, by: number, thickness: number, align: Wall['align']): Wall => ({
    id: uid(),
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness,
    align,
  })
  // Outer walls run clockwise along the inner faces, with their thickness outside.
  const top = w(10, 10, 990, 10, 20, 'left')
  const right = w(990, 10, 990, 690, 20, 'left')
  const bottom = w(990, 690, 10, 690, 20, 'left')
  const left = w(10, 690, 10, 10, 20, 'left')
  const kitchenLiving = w(10, 300, 600, 300, 10, 'center')
  const kitchenBath = w(350, 10, 350, 300, 10, 'center')
  const spine = w(600, 10, 600, 690, 10, 'center')
  const bedStudy = w(600, 420, 990, 420, 10, 'center')
  plan.walls = [top, right, bottom, left, kitchenLiving, kitchenBath, spine, bedStudy]

  const o = (wall: Wall, kind: OpeningKind, offset: number, width: number, flipSide = false, flipHinge = false): Opening => ({
    id: uid(),
    wallId: wall.id,
    kind,
    offset,
    width,
    flipSide,
    flipHinge,
  })
  plan.openings = [
    o(bottom, 'door', 510, 100, false, false),
    o(kitchenLiving, 'door', 280, 80, true, false),
    o(kitchenLiving, 'door', 470, 80, true, true),
    o(spine, 'door', 360, 80, true, false),
    o(spine, 'door', 550, 80, true, true),
    o(top, 'window', 165, 120),
    o(top, 'window', 465, 60),
    o(top, 'window', 790, 160),
    o(left, 'window', 190, 180),
    o(right, 'window', 550, 140),
    o(bottom, 'window', 790, 160),
  ]

  const i = (key: string, x: number, y: number, rotation = 0): Item => ({ id: uid(), defId: `builtin:${key}`, x, y, rotation })
  plan.items = [
    i('fridge', 45, 45),
    i('base-cabinet', 110, 40),
    i('sink', 180, 40),
    i('cooktop', 250, 40),
    i('base-cabinet', 310, 40),
    i('round-table', 140, 185),
    i('chair', 140, 115),
    i('chair', 140, 257, 180),
    i('bathtub', 445, 48),
    i('toilet', 560, 150, 90),
    i('washbasin', 572, 250, 90),
    i('rug', 200, 500, 90),
    i('sofa-3', 58, 500, -90),
    i('coffee-table', 170, 500, 90),
    i('armchair', 330, 400, 135),
    i('tv-unit', 572, 520, 90),
    i('plant', 40, 660),
    i('bed-double', 890, 210, 90),
    i('nightstand', 970, 105, 90),
    i('nightstand', 970, 315, 90),
    i('wardrobe', 635, 90, -90),
    i('desk', 955, 560, 90),
    i('office-chair', 890, 560, -90),
    i('bookshelf', 720, 672, 180),
  ]

  const label = (name: string, p: Pt): RoomLabel => ({ id: uid(), name, point: p })
  plan.roomLabels = [
    label('Kitchen', { x: 270, y: 150 }),
    label('Bath', { x: 440, y: 200 }),
    label('Living', { x: 390, y: 620 }),
    label('Bedroom', { x: 740, y: 260 }),
    label('Study', { x: 720, y: 510 }),
  ]
  return plan
}
