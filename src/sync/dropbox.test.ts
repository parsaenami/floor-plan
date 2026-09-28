import { describe, expect, it } from 'vitest'
import { parseEntry, planFileName } from './dropbox'

describe('Dropbox file names', () => {
  it('round-trips a plan id and version through the name', () => {
    const name = planFileName('My flat', 'Ab3_x-9Kq2', 1759070000123)
    expect(name).toBe('My flat.Ab3_x-9Kq2.1759070000123.floorplan.json')
    expect(parseEntry(name, `/${name}`)).toEqual({ id: `/${name}`, kind: 'plan', planId: 'Ab3_x-9Kq2', updatedAt: 1759070000123 })
  })

  it('keeps dots in the plan name', () => {
    expect(parseEntry('v1.2 draft.abc.5.floorplan.json', '/x')).toMatchObject({ planId: 'abc', updatedAt: 5 })
  })

  it('replaces characters file systems reject', () => {
    expect(planFileName('a/b:c?', 'id', 1)).toBe('a-b-c-.id.1.floorplan.json')
    expect(planFileName('   ', 'id', 1)).toBe('Plan.id.1.floorplan.json')
  })

  it('recognises the component library and ignores other files', () => {
    expect(parseEntry('Components.floorplan.json', '/Components.floorplan.json')).toEqual({ id: '/Components.floorplan.json', kind: 'components' })
    expect(parseEntry('notes.txt', '/notes.txt')).toBeNull()
    expect(parseEntry('old.floorplan.json', '/old.floorplan.json')).toBeNull()
  })
})
