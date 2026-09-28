import { describe, expect, it } from 'vitest'
import type { ComponentDef } from '../model/types'
import { mergeComponents, planActions, type SyncLedger } from './reconcile'

const ledger = (l: Partial<SyncLedger> = {}): SyncLedger => ({ synced: {}, tombstones: {}, ...l })
const types = (a: { type: string; planId: string }[]) => a.map((x) => `${x.type}:${x.planId}`).sort()

describe('planActions', () => {
  it('uploads new local plans and downloads new remote ones', () => {
    const a = planActions([{ id: 'a', updatedAt: 1 }], [{ fileId: 'f', planId: 'b', updatedAt: 1 }], ledger())
    expect(types(a)).toEqual(['download:b', 'upload:a'])
  })

  it('lets the newer copy win', () => {
    const remote = [{ fileId: 'f', planId: 'a', updatedAt: 5 }]
    expect(planActions([{ id: 'a', updatedAt: 9 }], remote, ledger())).toEqual([{ type: 'upload', planId: 'a', fileId: 'f' }])
    expect(planActions([{ id: 'a', updatedAt: 2 }], remote, ledger())[0].type).toBe('download')
  })

  it('does nothing when both sides match and are recorded', () => {
    const l = ledger({ synced: { a: { fileId: 'f', updatedAt: 5 } } })
    expect(planActions([{ id: 'a', updatedAt: 5 }], [{ fileId: 'f', planId: 'a', updatedAt: 5 }], l)).toEqual([])
  })

  it('deletes locally what was deleted on another device', () => {
    const l = ledger({ synced: { a: { fileId: 'f', updatedAt: 5 } } })
    expect(planActions([{ id: 'a', updatedAt: 5 }], [], l)).toEqual([{ type: 'delete-local', planId: 'a' }])
  })

  it('re-uploads a plan edited here after it was deleted elsewhere', () => {
    const l = ledger({ synced: { a: { fileId: 'f', updatedAt: 5 } } })
    expect(planActions([{ id: 'a', updatedAt: 8 }], [], l)).toEqual([{ type: 'upload', planId: 'a' }])
  })

  it('trashes the Drive copy of a plan deleted here', () => {
    const l = ledger({ tombstones: { a: 10 } })
    expect(planActions([], [{ fileId: 'f', planId: 'a', updatedAt: 5 }], l)).toEqual([{ type: 'trash-remote', planId: 'a', fileId: 'f' }])
    expect(planActions([], [], l)).toEqual([{ type: 'forget', planId: 'a' }])
  })

  it('keeps a remote edit made after the local delete', () => {
    const l = ledger({ tombstones: { a: 10 } })
    expect(planActions([], [{ fileId: 'f', planId: 'a', updatedAt: 12 }], l)[0].type).toBe('download')
  })

  it('holds back changes to a plan that is open in the editor', () => {
    const l = ledger({ synced: { a: { fileId: 'f', updatedAt: 5 } } })
    const hold = new Set(['a'])
    expect(planActions([{ id: 'a', updatedAt: 2 }], [{ fileId: 'f', planId: 'a', updatedAt: 5 }], ledger(), hold)).toEqual([])
    expect(planActions([{ id: 'a', updatedAt: 5 }], [], l, hold)).toEqual([])
  })

  it('trashes duplicate files for the same plan, keeping the newest', () => {
    const a = planActions(
      [],
      [
        { fileId: 'old', planId: 'a', updatedAt: 1 },
        { fileId: 'new', planId: 'a', updatedAt: 2 },
      ],
      ledger(),
    )
    expect(a).toContainEqual({ type: 'trash-remote', planId: 'a', fileId: 'old' })
    expect(a).toContainEqual({ type: 'download', planId: 'a', fileId: 'new', updatedAt: 2 })
  })
})

describe('mergeComponents', () => {
  const c = (id: string, updatedAt: number, name = id): ComponentDef => ({
    id,
    name,
    category: 'Other',
    width: 10,
    depth: 10,
    symbol: { kind: 'preset', shape: 'rect' },
    builtin: false,
    updatedAt,
  })

  it('unions both libraries, newest version first', () => {
    const m = mergeComponents({ components: [c('a', 1, 'old'), c('b', 1)], deleted: {} }, { components: [c('a', 2, 'new'), c('c', 1)], deleted: {} })
    expect(m.components.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(m.components[0].name).toBe('new')
  })

  it('applies deletions over older versions only', () => {
    const m = mergeComponents({ components: [c('a', 1), c('b', 9)], deleted: {} }, { components: [], deleted: { a: 5, b: 5 } })
    expect(m.components.map((x) => x.id)).toEqual(['b'])
    expect(m.deleted).toEqual({ a: 5, b: 5 })
  })
})
