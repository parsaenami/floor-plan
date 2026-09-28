import { create } from 'zustand'
import type { Plan } from '../model/types'
import { emptySyncMeta, loadSyncMeta, normalizePlan, saveSyncMeta, type SyncMeta } from '../persistence/db'
import { planFile, type PlanFile } from '../persistence/importExport'
import { useComponents } from '../store/componentsStore'
import { useEditor } from '../store/editorStore'
import { usePlans } from '../store/plansStore'
import { AuthError, ensureFolder, listFolder, readJson, trashFile, writeJson } from './drive'
import { browserAuth, detectAuth, type Auth, type AuthMode } from './auth'
import { onLocalChange, withoutEcho } from './events'
import { mergeComponents, planActions, sameComponents, type ComponentsDoc } from './reconcile'

export type SyncStatus =
  /** Not connected to Drive. */
  | 'off'
  | 'idle'
  | 'syncing'
  /** Connected, but Google access lapsed; the user has to connect again. */
  | 'needs-auth'
  | 'error'

const DEBOUNCE = 2500
const COMPONENTS_FILE = 'components.floorplan.json'

/** Messages for the ?drive=… result the server sign-in returns with. */
const RETURN_ERRORS: Record<string, string> = {
  denied: 'Google Drive access was not granted.',
  expired: 'The sign-in took too long or was started in another tab. Try again.',
  error: 'Google sign-in failed. Try again.',
}

interface SyncState {
  status: SyncStatus
  error: string | null
  lastSync: number | null
  /** How sign-in works here; null until detected. */
  mode: AuthMode | null
  init: () => Promise<void>
  /**
   * Signs in and turns sync on. With the server this leaves the page and comes
   * back; with the browser popup call it straight from a click. `clientId` is
   * only for self-hosted copies without sign-in set up.
   */
  connect: (clientId?: string) => Promise<void>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
}

let meta: SyncMeta = emptySyncMeta()
let auth: Auth | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false

const persist = () => saveSyncMeta(meta)

/** Reads and removes the ?drive=… marker left by the server sign-in. */
function takeReturnMarker(): string | null {
  const url = new URL(window.location.href)
  const v = url.searchParams.get('drive')
  if (!v) return null
  url.searchParams.delete('drive')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return v
}

export const useSync = create<SyncState>((set, get) => {
  const fail = (e: unknown) => {
    if (e instanceof AuthError) {
      auth?.invalidate()
      set({ status: 'needs-auth', error: null })
    } else {
      console.error(e)
      set({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed.' })
    }
  }

  const schedule = () => {
    if (!meta.connected) return
    clearTimeout(timer)
    timer = setTimeout(() => void get().syncNow(), DEBOUNCE)
  }

  onLocalChange((c) => {
    if (c.type === 'plan-deleted' && meta.synced[c.id]) {
      meta.tombstones[c.id] = Date.now()
      void persist()
    }
    if (c.type === 'component-deleted') {
      meta.deletedComponents[c.id] = Date.now()
      void persist()
    }
    schedule()
  })

  async function run(access: string) {
    const folderId = await ensureFolder(access, meta.folderId)
    if (folderId !== meta.folderId) {
      meta.folderId = folderId
      // A new folder means nothing we remember is on Drive any more.
      meta.synced = {}
    }
    const files = await listFolder(access, folderId)

    /* Plans */
    const remote = files
      .filter((f) => f.appProperties?.fps === 'plan' && f.appProperties.planId)
      .map((f) => ({ fileId: f.id, planId: f.appProperties!.planId, updatedAt: Number(f.appProperties!.updatedAt) || 0 }))
    const plans = usePlans.getState().plans
    const open = useEditor.getState().plan?.id
    const actions = planActions(
      plans.map((p) => ({ id: p.id, updatedAt: p.updatedAt })),
      remote,
      meta,
      new Set(open ? [open] : []),
    )
    const custom = useComponents.getState().custom
    for (const a of actions) {
      switch (a.type) {
        case 'upload': {
          const plan = usePlans.getState().plans.find((p) => p.id === a.planId)
          if (!plan) break
          const fileId = await writeJson(access, {
            id: a.fileId,
            name: `${plan.name}.floorplan.json`,
            folderId,
            appProperties: { fps: 'plan', planId: plan.id, updatedAt: String(plan.updatedAt) },
            data: planFile(plan, custom),
          })
          meta.synced[plan.id] = { fileId, updatedAt: plan.updatedAt }
          delete meta.tombstones[plan.id]
          break
        }
        case 'download': {
          const file = await readJson<PlanFile>(access, a.fileId)
          if (file?.type !== 'plan' || !file.plan) break
          // Keep the Drive id and timestamp so both sides agree on the version.
          const plan: Plan = normalizePlan({ ...file.plan, id: a.planId, updatedAt: a.updatedAt })
          await withoutEcho(async () => {
            if (file.components?.length) await useComponents.getState().upsertMany(file.components, false)
            await usePlans.getState().upsert(plan)
          })
          meta.synced[a.planId] = { fileId: a.fileId, updatedAt: a.updatedAt }
          delete meta.tombstones[a.planId]
          break
        }
        case 'delete-local':
          await withoutEcho(() => usePlans.getState().remove(a.planId))
          delete meta.synced[a.planId]
          break
        case 'trash-remote':
          await trashFile(access, a.fileId)
          if (meta.synced[a.planId]?.fileId === a.fileId) delete meta.synced[a.planId]
          if (!usePlans.getState().plans.some((p) => p.id === a.planId)) delete meta.tombstones[a.planId]
          break
        case 'forget':
          delete meta.tombstones[a.planId]
          break
        case 'mark':
          meta.synced[a.planId] = { fileId: a.fileId, updatedAt: a.updatedAt }
          break
      }
      await persist()
    }

    /* Component library: one file, merged both ways. */
    const libFile = files.find((f) => f.appProperties?.fps === 'components')
    const theirs: ComponentsDoc = libFile ? await readJson<ComponentsDoc>(access, libFile.id) : { components: [], deleted: {} }
    const ours: ComponentsDoc = { components: useComponents.getState().custom, deleted: meta.deletedComponents }
    const merged = mergeComponents(ours, { components: theirs.components ?? [], deleted: theirs.deleted ?? {} })
    if (!libFile || !sameComponents(merged.components, theirs.components ?? []) || JSON.stringify(merged.deleted) !== JSON.stringify(theirs.deleted ?? {})) {
      await writeJson(access, { id: libFile?.id, name: COMPONENTS_FILE, folderId, appProperties: { fps: 'components' }, data: merged })
    }
    if (!sameComponents(merged.components, useComponents.getState().custom)) {
      await useComponents.getState().replaceAll(merged.components)
    }
    meta.deletedComponents = merged.deleted
    meta.lastSync = Date.now()
    await persist()
    set({ status: 'idle', error: null, lastSync: meta.lastSync })
  }

  /** Runs a sync; with the server, a rejected token is renewed and the sync retried once. */
  async function attempt() {
    const access = await auth!.token()
    if (!access) return set({ status: 'needs-auth' })
    set({ status: 'syncing', error: null })
    try {
      await run(access)
    } catch (e) {
      if (!(e instanceof AuthError) || auth!.mode !== 'server') throw e
      auth!.invalidate()
      const fresh = await auth!.token()
      if (!fresh) throw e
      await run(fresh)
    }
  }

  return {
    status: 'off',
    error: null,
    lastSync: null,
    mode: null,

    async init() {
      meta = await loadSyncMeta()
      auth = await detectAuth(meta.clientId)
      set({ mode: auth.mode, lastSync: meta.lastSync ?? null })
      const marker = takeReturnMarker()
      if (marker === 'connected') {
        meta.connected = true
        await persist()
      } else if (marker) set({ error: RETURN_ERRORS[marker] ?? RETURN_ERRORS.error })
      if (!meta.connected) return set({ status: 'off' })
      await get().syncNow()
    },

    async connect(clientId) {
      if (!auth) return
      set({ error: null })
      if (clientId?.trim()) {
        // Self-hosted copy without sign-in set up: use the entered client ID in the browser.
        auth = browserAuth(clientId.trim())
        meta.clientId = clientId.trim()
        await persist()
        set({ mode: auth.mode })
      }
      if (auth.mode === 'server') {
        // Save the plan being edited before the page leaves for Google.
        const open = useEditor.getState().plan
        if (open) await usePlans.getState().upsert(open)
      }
      try {
        await auth.connect()
      } catch (e) {
        return set({ status: meta.connected ? 'needs-auth' : 'off', error: e instanceof Error ? e.message : 'Google sign-in failed.' })
      }
      meta.connected = true
      await persist()
      await get().syncNow()
    },

    async disconnect() {
      clearTimeout(timer)
      await auth?.disconnect()
      // Forget what is on Drive; files stay there and a later connect merges again.
      meta = { ...emptySyncMeta(), clientId: meta.clientId }
      await persist()
      set({ status: 'off', error: null, lastSync: null })
    },

    async syncNow() {
      if (!meta.connected || !auth) return
      if (running) {
        again = true
        return running
      }
      clearTimeout(timer)
      running = attempt()
        .catch(fail)
        .finally(() => {
          running = null
          if (again) {
            again = false
            schedule()
          }
        })
      return running
    },
  }
})
