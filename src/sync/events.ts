/**
 * Local data changes that sync should hear about. The plan and component
 * stores emit these; the sync store listens. Keeping it one-way avoids an
 * import cycle between the stores and sync.
 */
export type LocalChange = { type: 'plan-saved' } | { type: 'plan-deleted'; id: string } | { type: 'components-saved' } | { type: 'component-deleted'; id: string }

const listeners = new Set<(c: LocalChange) => void>()

/** Set while sync itself writes local data, so those writes are not echoed back. */
let muted = 0

export function emitLocalChange(c: LocalChange) {
  if (muted) return
  listeners.forEach((l) => l(c))
}

export function onLocalChange(l: (c: LocalChange) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export async function withoutEcho<T>(f: () => Promise<T>): Promise<T> {
  muted++
  try {
    return await f()
  } finally {
    muted--
  }
}
