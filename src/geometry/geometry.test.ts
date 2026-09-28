import { describe, expect, it } from 'vitest'
import type { Plan, Pt, Wall } from '../model/types'
import { newPlan, samplePlan } from '../model/defaults'
import { addWalls, orientWalls, reorderItems, stackRoom } from '../model/ops'
import { detectRooms } from './rooms'
import { lockAngle, snapPoint } from './snap'
import {
  bulgeForSweep,
  bulgeThrough,
  clampOpeningOffset,
  closestOnWall,
  pointAlong,
  rectRoomWalls,
  solidIntervals,
  sweepOf,
  wallArc,
  wallGeometry,
  wallLength,
} from './walls'
import { dist, pointInPolygon, polygonSignedArea } from './vec'

let n = 0
const wall = (a: Pt, b: Pt, thickness = 10): Wall => ({ id: `w${n++}`, a, b, thickness })
const rectWalls = (x0: number, y0: number, x1: number, y1: number, t = 10) => [
  wall({ x: x0, y: y0 }, { x: x1, y: y0 }, t),
  wall({ x: x1, y: y0 }, { x: x1, y: y1 }, t),
  wall({ x: x1, y: y1 }, { x: x0, y: y1 }, t),
  wall({ x: x0, y: y1 }, { x: x0, y: y0 }, t),
]

describe('rooms', () => {
  it('finds one room in a closed rectangle, measured to the inner faces', () => {
    const rooms = detectRooms(rectWalls(0, 0, 410, 310))
    expect(rooms).toHaveLength(1)
    expect(rooms[0].area).toBeCloseTo(12, 5) // 400 × 300 inside 10 cm walls
  })

  it('works regardless of wall drawing direction', () => {
    const walls = rectWalls(0, 0, 410, 310).map((w) => ({ ...w, a: w.b, b: w.a }))
    expect(detectRooms(walls)).toHaveLength(1)
  })

  it('splits two rooms that share a wall', () => {
    const walls = [...rectWalls(0, 0, 800, 400), wall({ x: 400, y: 0 }, { x: 400, y: 400 })]
    const rooms = detectRooms(walls)
    expect(rooms).toHaveLength(2)
    for (const r of rooms) expect(r.area).toBeCloseTo((390 * 390) / 10000, 5)
  })

  it('handles a T-junction where a wall ends on another wall', () => {
    const walls = [...rectWalls(0, 0, 800, 400), wall({ x: 300, y: 400 }, { x: 300, y: 0 })]
    expect(detectRooms(walls)).toHaveLength(2)
  })

  it('handles an L-shaped room', () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 600 },
      { x: 0, y: 600 },
    ]
    const walls = pts.map((p, i) => wall(p, pts[(i + 1) % pts.length], 0))
    const rooms = detectRooms(walls)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].area).toBeCloseTo(27, 5)
  })

  it('ignores open chains and dangling walls', () => {
    const open = [wall({ x: 0, y: 0 }, { x: 400, y: 0 }), wall({ x: 400, y: 0 }, { x: 400, y: 300 })]
    expect(detectRooms(open)).toHaveLength(0)
    const withStub = [...rectWalls(0, 0, 410, 310), wall({ x: 200, y: 0 }, { x: 200, y: 100 })]
    const rooms = detectRooms(withStub)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].area).toBeCloseTo(12, 5)
  })

  it('names rooms from labels inside them', () => {
    const rooms = detectRooms(rectWalls(0, 0, 410, 310), [{ id: 'l', name: 'Office', point: { x: 100, y: 100 } }])
    expect(rooms[0].label?.name).toBe('Office')
  })

  it('finds every room of the sample apartment', () => {
    const plan = samplePlan('Sample')
    const rooms = detectRooms(plan.walls, plan.roomLabels)
    expect(rooms.map((r) => r.label?.name).sort()).toEqual(['Bath', 'Bedroom', 'Kitchen', 'Living', 'Study'])
  })
})

describe('rectangle room tool', () => {
  it('runs walls along the dragged rectangle with thickness outside, so its interior is exact', () => {
    const segs = rectRoomWalls({ x: 0, y: 0 }, { x: 400, y: 300 })
    const walls = segs.map(([a, b]) => ({ ...wall(a, b, 15), align: 'left' as const }))
    expect(detectRooms(walls)[0].area).toBeCloseTo(12, 5)
  })
})

describe('wall sides', () => {
  it('measures rooms to the line when the thickness is outside', () => {
    const walls = rectWalls(0, 0, 400, 300, 20).map((w) => ({ ...w, align: 'left' as const }))
    expect(detectRooms(walls)[0].area).toBeCloseTo(12, 5)
  })

  it('measures rooms to the far face when the thickness is inside', () => {
    const walls = rectWalls(0, 0, 400, 300, 20).map((w) => ({ ...w, align: 'right' as const }))
    expect(detectRooms(walls)[0].area).toBeCloseTo((360 * 260) / 10000, 5)
  })

  it('orients a counter-clockwise room so its thickness ends up outside', () => {
    const plan: Plan = newPlan('t')
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 400, y: 300 },
      { x: 400, y: 0 },
    ]
    const walls = addWalls(plan, pts.map((p, i) => [p, pts[(i + 1) % 4]] as [Pt, Pt]), 20, 'left')
    expect(detectRooms(plan.walls)[0].area).toBeCloseTo((360 * 260) / 10000, 5)
    orientWalls(plan, new Set(walls.map((w) => w.id)))
    expect(plan.walls.every((w) => w.align === 'right')).toBe(true)
    expect(detectRooms(plan.walls)[0].area).toBeCloseTo(12, 5)
  })

  it('mitres a one-sided corner so the outer corner is filled', () => {
    const walls = rectWalls(0, 0, 400, 300, 20).map((w) => ({ ...w, align: 'left' as const }))
    const geo = wallGeometry(walls, [])
    const top = geo.pieces.get(walls[0].id)![0]
    // The outer corner (-20, -20) belongs to the top wall's outline.
    expect(top.some((p) => dist(p, { x: -20, y: -20 }) < 1e-6)).toBe(true)
    expect(top.some((p) => dist(p, { x: 420, y: -20 }) < 1e-6)).toBe(true)
  })

  it('meets the face of the wall it tees into', () => {
    const host = { ...wall({ x: 0, y: 0 }, { x: 400, y: 0 }, 20), align: 'center' as const }
    const stub = { ...wall({ x: 200, y: 0 }, { x: 200, y: 200 }, 10), align: 'center' as const }
    const piece = wallGeometry([host, stub], []).pieces.get(stub.id)![0]
    expect(Math.min(...piece.map((p) => p.y))).toBeCloseTo(10)
  })
})

describe('curved walls', () => {
  const half = { ...wall({ x: 0, y: 0 }, { x: 200, y: 0 }), bulge: 1 }
  const quarter = { ...wall({ x: 0, y: 0 }, { x: 100, y: 100 }), bulge: bulgeForSweep(90) }

  it('turns a bulge of 1 into a half circle', () => {
    const arc = wallArc(half)!
    expect(arc.r).toBeCloseTo(100)
    expect(arc.c.x).toBeCloseTo(100)
    expect(arc.c.y).toBeCloseTo(0)
    expect(wallLength(half)).toBeCloseTo(Math.PI * 100)
    expect(sweepOf(half)).toBeCloseTo(180)
  })

  it('bulges to the left of a→b (up on screen here)', () => {
    const apex = pointAlong(half, wallLength(half) / 2)
    expect(apex.x).toBeCloseTo(100)
    expect(apex.y).toBeCloseTo(-100)
    expect(pointAlong(half, wallLength(half)).x).toBeCloseTo(200)
  })

  it('makes a quarter circle', () => {
    const arc = wallArc(quarter)!
    expect(arc.r).toBeCloseTo(100)
    expect(wallLength(quarter)).toBeCloseTo((Math.PI * 100) / 2)
  })

  it('finds the arc passing through a point', () => {
    expect(bulgeThrough({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: -100 })).toBeCloseTo(1)
  })

  it('projects points onto the arc', () => {
    const c = closestOnWall({ x: 100, y: -150 }, half)
    expect(c.point.y).toBeCloseTo(-100)
    expect(c.t).toBeCloseTo(0.5)
    expect(c.d).toBeCloseTo(50)
    // Past the ends, the nearest endpoint wins.
    expect(closestOnWall({ x: -50, y: 30 }, half).t).toBe(0)
  })

  it('encloses a room with a half-circle wall', () => {
    const walls = [wall({ x: 200, y: 0 }, { x: 0, y: 0 }, 0), { ...wall({ x: 0, y: 0 }, { x: 200, y: 0 }, 0), bulge: 1 }]
    const rooms = detectRooms(walls)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].area).toBeCloseTo((Math.PI * 100 * 100) / 2 / 10000, 1)
    expect(pointInPolygon({ x: 100, y: -50 }, rooms[0].outline)).toBe(true)
  })
})

describe('stacking order', () => {
  const plan = (): Plan => {
    const p = newPlan('z')
    p.items = ['a', 'b', 'c', 'd'].map((id) => ({ id, defId: 'x', x: 0, y: 0, rotation: 0 }))
    return p
  }
  const order = (p: Plan) => p.items.map((i) => i.id).join('')
  const sel = (...ids: string[]) => ids.map((id) => ({ kind: 'item' as const, id }))

  it('brings to front and sends to back', () => {
    const p = plan()
    reorderItems(p, sel('a'), 'front')
    expect(order(p)).toBe('bcda')
    reorderItems(p, sel('d', 'a'), 'back')
    expect(order(p)).toBe('dabc')
  })

  it('moves one step at a time, keeping a group together', () => {
    const p = plan()
    reorderItems(p, sel('a', 'b'), 'forward')
    expect(order(p)).toBe('cabd')
    reorderItems(p, sel('d'), 'backward')
    expect(order(p)).toBe('cadb')
  })

  it('knows when an item is already at the top or bottom', () => {
    const p = plan()
    expect(stackRoom(p, sel('d'))).toEqual({ up: false, down: true })
    expect(stackRoom(p, sel('a', 'b'))).toEqual({ up: true, down: false })
  })
})

describe('snapping', () => {
  const walls = [wall({ x: 0, y: 0 }, { x: 500, y: 0 })]
  const base = { walls, grid: 10, radius: 10, enabled: true }

  it('prefers wall endpoints', () => {
    expect(snapPoint({ x: 496, y: 4 }, base)).toEqual({ p: { x: 500, y: 0 }, kind: 'endpoint' })
  })

  it('snaps onto a wall centreline', () => {
    const r = snapPoint({ x: 233, y: 3 }, base)
    expect(r.kind).toBe('wall')
    expect(r.p.y).toBe(0)
  })

  it('falls back to the grid', () => {
    expect(snapPoint({ x: 233, y: 157 }, base)).toEqual({ p: { x: 230, y: 160 }, kind: 'grid' })
  })

  it('does nothing when disabled', () => {
    expect(snapPoint({ x: 233.3, y: 157.2 }, { ...base, enabled: false }).p).toEqual({ x: 233.3, y: 157.2 })
  })

  it('locks to 45° steps from the anchor', () => {
    const p = lockAngle({ x: 0, y: 0 }, { x: 100, y: 8 })
    expect(p.y).toBeCloseTo(0)
    const d = lockAngle({ x: 0, y: 0 }, { x: 100, y: 90 })
    expect(d.x).toBeCloseTo(d.y)
  })
})

describe('openings', () => {
  const w = wall({ x: 0, y: 0 }, { x: 300, y: 0 }, 20)

  it('clamps the opening inside its wall', () => {
    expect(clampOpeningOffset(w, 90, 10)).toBe(45)
    expect(clampOpeningOffset(w, 90, 290)).toBe(255)
    expect(clampOpeningOffset(w, 90, 150)).toBe(150)
  })

  it('cuts solid intervals around openings', () => {
    const intervals = solidIntervals(w, [{ id: 'o', wallId: w.id, kind: 'door', offset: 150, width: 100, flipSide: false, flipHinge: false }])
    expect(intervals).toEqual([
      [0, 100],
      [200, 300],
    ])
  })
})

describe('vec', () => {
  it('computes signed area in y-down space', () => {
    expect(
      polygonSignedArea([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBe(100)
  })
})
