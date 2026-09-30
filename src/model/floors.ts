import type { Floor, FloorContent, Plan } from './types'
import { DEFAULT_FLOOR_NAME, uid } from './defaults'

/*
 * The active floor's content lives in the plan's top-level arrays, so everything
 * that draws, edits or exports a plan works on the active floor unchanged.
 * Other floors keep their content in `plan.floors`.
 */

const content = (f: Partial<FloorContent>): FloorContent => ({
  walls: f.walls ?? [],
  openings: f.openings ?? [],
  items: f.items ?? [],
  roomLabels: f.roomLabels ?? [],
  dimensions: f.dimensions ?? [],
})

const stripContent = ({ id, name }: Floor): Floor => ({ id, name })

/** Gives a plan saved before floors a single floor holding its content. */
export function withFloors(plan: Plan): Plan {
  const floors = plan.floors?.length ? plan.floors : [{ id: uid(), name: DEFAULT_FLOOR_NAME }]
  const floorId = floors.some((f) => f.id === plan.floorId) ? plan.floorId! : floors[0].id
  return {
    ...plan,
    floors: floors.map((f) => (f.id === floorId ? stripContent(f) : { ...f, ...content(f) })),
    floorId,
  }
}

export function activeFloor(plan: Plan): Floor | undefined {
  return plan.floors?.find((f) => f.id === plan.floorId)
}

/** A single-floor plan showing the given floor's content. */
export function floorView(plan: Plan, id: string): Plan {
  const f = plan.floors?.find((x) => x.id === id)
  return !f || id === plan.floorId ? plan : { ...plan, ...content(f), floorId: id }
}

/** Makes another floor active, storing the current one's content in its entry. Mutates. */
export function switchFloor(plan: Plan, id: string) {
  const floors = plan.floors ?? []
  const target = floors.find((f) => f.id === id)
  if (!target || id === plan.floorId) return
  const next = content(target)
  plan.floors = floors.map((f) => (f.id === plan.floorId ? { ...f, ...content(plan) } : f.id === id ? stripContent(f) : f))
  Object.assign(plan, next)
  plan.floorId = id
}

/** Appends an empty floor and makes it active. Mutates. */
export function addFloor(plan: Plan, name: string): Floor {
  Object.assign(plan, withFloors(plan))
  const floor: Floor = { id: uid(), name, ...content({}) }
  plan.floors!.push(floor)
  switchFloor(plan, floor.id)
  return floor
}

/** Deletes a floor, keeping at least one; a deleted active floor hands over to its neighbour. Mutates. */
export function deleteFloor(plan: Plan, id: string) {
  const floors = plan.floors ?? []
  const i = floors.findIndex((f) => f.id === id)
  if (i < 0 || floors.length < 2) return
  if (id === plan.floorId) switchFloor(plan, floors[i ? i - 1 : 1].id)
  plan.floors = plan.floors!.filter((f) => f.id !== id)
}

export function renameFloor(plan: Plan, id: string, name: string) {
  const f = plan.floors?.find((x) => x.id === id)
  if (f) f.name = name
}

/** Moves a floor to another position in the list. Mutates. */
export function moveFloor(plan: Plan, id: string, to: number) {
  const floors = plan.floors ?? []
  const i = floors.findIndex((f) => f.id === id)
  if (i < 0 || to < 0 || to >= floors.length) return
  floors.splice(to, 0, ...floors.splice(i, 1))
}
