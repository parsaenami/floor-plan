/**
 * What sync needs from a cloud storage service. Google Drive (drive.ts) and
 * Dropbox (dropbox.ts) each implement it, so syncStore does not care which one
 * the user connected.
 */

export type ProviderId = 'drive' | 'dropbox'

export const PROVIDER_NAME: Record<ProviderId, string> = { drive: 'Google Drive', dropbox: 'Dropbox' }

/** The access token was rejected or has expired; the user may need to sign in again. */
export class AuthError extends Error {}

/** A file sync made, as listed in the app's folder. */
export type RemoteEntry = { id: string; kind: 'plan'; planId: string; updatedAt: number } | { id: string; kind: 'components' }

export type RemoteWrite = { id?: string; folderId: string; data: unknown } & (
  | { kind: 'plan'; name: string; planId: string; updatedAt: number }
  | { kind: 'components' }
)

export interface RemoteStore {
  /** The app's folder, created on first use. `known` is the id remembered from last time. */
  ensureFolder(known?: string): Promise<string>
  list(folderId: string): Promise<RemoteEntry[]>
  read<T>(id: string): Promise<T>
  /** Creates or replaces a file and returns its id, which may have changed. */
  write(file: RemoteWrite): Promise<string>
  /** Deletes a file in a way the user can still undo (a bin or version history). */
  trash(id: string): Promise<void>
}
