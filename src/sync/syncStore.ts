import { create } from 'zustand'
import type { Plan } from '../model/types'
import { emptySyncMeta, loadSyncMeta, normalizePlan, saveSyncMeta, type SyncMeta } from '../persistence/db'
import { planFile, type PlanFile } from '../persistence/importExport'
import { useComponents } from '../store/componentsStore'
import { useEditor } from '../store/editorStore'
import { usePlans } from '../store/plansStore'
import { driveStore } from './drive'
import { completeDropboxSignIn, dropboxAuth, dropboxStore, hasDropbox } from './dropbox'
import { browserAuth, detectAuth, type Auth, type AuthMode } from './auth'
import { AuthError, PROVIDER_NAME, type ProviderId, type RemoteStore } from './provider'
import { onLocalChange, withoutEcho } from './events'
import { mergeComponents, planActions, sameComponents, type ComponentsDoc } from './reconcile'

export type SyncStatus =
  /** Not connected to any cloud storage. */
  | 'off'
  | 'idle'
  | 'syncing'
  /** Connected, but access lapsed; the user has to connect again. */
  | 'needs-auth'
  | 'error'

const DEBOUNCE = 2500

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
  /** The storage sync is connected to, or null when off. */
  provider: ProviderId | null
  /** How Google sign-in works here; null until detected. */
  mode: AuthMode | null
  init: () => Promise<void>
  /**
   * Signs in and turns sync on. Dropbox and Google with the server leave the
   * page and come back; the Google popup must be called straight from a click.
   * `clientId` is only for self-hosted copies without Google sign-in set up.
   */
  connect: (provider: ProviderId, clientId?: string) => Promise<void>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
}

let meta: SyncMeta = emptySyncMeta()
let driveAuth: Auth | null = null
const dbxAuth = hasDropbox ? dropboxAuth() : null
let auth: Auth | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false

const persist = () => saveSyncMeta(meta)
const providerOf = (m: SyncMeta): ProviderId => m.provider ?? 'drive'
const storeFor = (p: ProviderId, access: string): RemoteStore => (p === 'dropbox' ? dropboxStore(access) : driveStore(access))

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
    const remoteStore = storeFor(providerOf(meta), access)
    const folderId = await remoteStore.ensureFolder(meta.folderId)
    if (folderId !== meta.folderId) {
      meta.folderId = folderId
      // A new folder means nothing we remember is there any more.
      meta.synced = {}
    }
    const files = await remoteStore.list(folderId)

    /* Plans */
    const remote = files.flatMap((f) => (f.kind === 'plan' ? [{ fileId: f.id, planId: f.planId, updatedAt: f.updatedAt }] : []))
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
          const fileId = await remoteStore.write({
            id: a.fileId,
            folderId,
            kind: 'plan',
            name: plan.name,
            planId: plan.id,
            updatedAt: plan.updatedAt,
            data: planFile(plan, custom),
          })
          meta.synced[plan.id] = { fileId, updatedAt: plan.updatedAt }
          delete meta.tombstones[plan.id]
          break
        }
        case 'download': {
          const file = await remoteStore.read<PlanFile>(a.fileId)
          if (file?.type !== 'plan' || !file.plan) break
          // Keep the remote id and timestamp so both sides agree on the version.
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
          await remoteStore.trash(a.fileId)
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
    const libFile = files.find((f) => f.kind === 'components')
    const theirs: ComponentsDoc = libFile ? await remoteStore.read<ComponentsDoc>(libFile.id) : { components: [], deleted: {} }
    const ours: ComponentsDoc = { components: useComponents.getState().custom, deleted: meta.deletedComponents }
    const merged = mergeComponents(ours, { components: theirs.components ?? [], deleted: theirs.deleted ?? {} })
    if (!libFile || !sameComponents(merged.components, theirs.components ?? []) || JSON.stringify(merged.deleted) !== JSON.stringify(theirs.deleted ?? {})) {
      await remoteStore.write({ id: libFile?.id, folderId, kind: 'components', data: merged })
    }
    if (!sameComponents(merged.components, useComponents.getState().custom)) {
      await useComponents.getState().replaceAll(merged.components)
    }
    meta.deletedComponents = merged.deleted
    meta.lastSync = Date.now()
    await persist()
    set({ status: 'idle', error: null, lastSync: meta.lastSync })
  }

  /** Runs a sync; where tokens renew on their own, a rejected one is renewed and the sync retried once. */
  async function attempt() {
    const access = await auth!.token()
    if (!access) return set({ status: 'needs-auth' })
    set({ status: 'syncing', error: null })
    try {
      await run(access)
    } catch (e) {
      if (!(e instanceof AuthError) || !auth!.renewable) throw e
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
    provider: null,
    mode: null,

    async init() {
      meta = await loadSyncMeta()
      driveAuth = await detectAuth(meta.clientId)
      set({ mode: driveAuth.mode, lastSync: meta.lastSync ?? null })
      const back = async (provider: ProviderId) => {
        meta = { ...emptySyncMeta(), clientId: meta.clientId, connected: true, provider }
        await persist()
      }
      const marker = takeReturnMarker()
      if (marker === 'connected') await back('drive')
      else if (marker) set({ error: RETURN_ERRORS[marker] ?? RETURN_ERRORS.error })
      const dropbox = await completeDropboxSignIn()
      if (dropbox === 'connected') await back('dropbox')
      else if (dropbox) set({ error: dropbox })
      auth = providerOf(meta) === 'dropbox' ? dbxAuth : driveAuth
      if (!meta.connected || !auth) return set({ status: 'off', provider: null })
      set({ provider: providerOf(meta) })
      await get().syncNow()
    },

    async connect(provider, clientId) {
      if (meta.connected && providerOf(meta) !== provider) {
        return set({ error: `Disconnect ${PROVIDER_NAME[providerOf(meta)]} first.` })
      }
      set({ error: null })
      if (provider === 'drive' && clientId?.trim()) {
        // Self-hosted copy without sign-in set up: use the entered client ID in the browser.
        driveAuth = browserAuth(clientId.trim())
        meta.clientId = clientId.trim()
        await persist()
        set({ mode: driveAuth.mode })
      }
      auth = provider === 'dropbox' ? dbxAuth : driveAuth
      if (!auth) return
      if (auth.redirects) {
        // Save the plan being edited before the page leaves for sign-in.
        const open = useEditor.getState().plan
        if (open) await usePlans.getState().upsert(open)
      }
      try {
        await auth.connect()
      } catch (e) {
        return set({ status: meta.connected ? 'needs-auth' : 'off', error: e instanceof Error ? e.message : 'Sign-in failed.' })
      }
      meta.connected = true
      meta.provider = provider
      await persist()
      set({ provider })
      await get().syncNow()
    },

    async disconnect() {
      clearTimeout(timer)
      await auth?.disconnect()
      // Forget what is stored remotely; files stay there and a later connect merges again.
      meta = { ...emptySyncMeta(), clientId: meta.clientId }
      auth = null
      await persist()
      set({ status: 'off', error: null, lastSync: null, provider: null })
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
