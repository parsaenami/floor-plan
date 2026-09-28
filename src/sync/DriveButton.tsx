import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, Modal } from '../ui'
import { FOLDER_NAME } from './drive'
import { useSync, type SyncStatus } from './syncStore'

const LABEL: Record<SyncStatus, string> = {
  off: 'Google Drive',
  idle: 'Synced',
  syncing: 'Syncing…',
  'needs-auth': 'Reconnect Drive',
  error: 'Sync error',
}

function ago(t: number | null) {
  if (!t) return 'not yet'
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(t).toLocaleDateString()
}

/** Top-bar entry point for Google Drive sync; opens the Drive dialog. */
export function DriveButton({ compact = false }: { compact?: boolean }) {
  const status = useSync((s) => s.status)
  const lastSync = useSync((s) => s.lastSync)
  const [open, setOpen] = useState(false)
  const icon =
    status === 'syncing' ? <RefreshCw size={14} className="spin" /> : status === 'idle' ? <Cloud size={14} /> : <CloudOff size={14} />
  const title = status === 'idle' ? `Google Drive · synced ${ago(lastSync)}` : `Google Drive · ${LABEL[status]}`
  return (
    <>
      {compact ? (
        <button className={`icon-btn drive-btn ${status}`} title={title} onClick={() => setOpen(true)}>
          {icon}
        </button>
      ) : (
        <button className={`btn ghost drive-btn ${status}`} title={title} onClick={() => setOpen(true)}>
          {icon} {LABEL[status]}
        </button>
      )}
      {open && <DriveDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function DriveDialog({ onClose }: { onClose: () => void }) {
  const { status, error, lastSync, mode, connect, disconnect, syncNow } = useSync()
  const [clientId, setClientId] = useState('')
  const [, tick] = useState(0)

  useEffect(() => {
    // Keep "synced 2 min ago" fresh while the dialog is open.
    const t = setInterval(() => tick((n) => n + 1), 15000)
    return () => clearInterval(t)
  }, [])

  const connected = status !== 'off'
  const unavailable = mode === 'none' && !connected

  return (
    <Modal
      title="Google Drive"
      onClose={onClose}
      footer={
        connected ? (
          <>
            <button className="btn ghost" onClick={() => void disconnect()}>
              Disconnect
            </button>
            {status === 'needs-auth' ? (
              <button className="btn primary" onClick={() => void connect()}>
                <Cloud size={14} /> Connect again
              </button>
            ) : (
              <button className="btn primary" disabled={status === 'syncing'} onClick={() => void syncNow()}>
                <RefreshCw size={14} className={status === 'syncing' ? 'spin' : undefined} /> Sync now
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Not now
            </button>
            <button
              className="btn primary"
              disabled={mode === null || (unavailable && !clientId.trim())}
              onClick={() => void connect(unavailable ? clientId : undefined)}
            >
              <Cloud size={14} /> Connect Google Drive
            </button>
          </>
        )
      }
    >
      {connected ? (
        <>
          <p className="drive-lead">
            Plans and custom components are saved to the <strong>{FOLDER_NAME}</strong> folder in your Drive. Changes sync on their own a few
            seconds after you make them. To carry on from another device, open the app there and connect the same Google account.
          </p>
          <table className="props-table mono">
            <tbody>
              <tr>
                <td>Status</td>
                <td>{status === 'idle' ? 'Up to date' : status === 'needs-auth' ? 'Not signed in' : LABEL[status]}</td>
              </tr>
              <tr>
                <td>Last sync</td>
                <td>{ago(lastSync)}</td>
              </tr>
            </tbody>
          </table>
          {status === 'needs-auth' && (
            <p className="drive-note">
              {mode === 'server'
                ? 'Google access was removed or has expired. Connect again to keep syncing; nothing is lost meanwhile.'
                : 'Google sign-ins last an hour on this site. Connect again to keep syncing; nothing is lost meanwhile.'}
            </p>
          )}
        </>
      ) : unavailable ? (
        <>
          <p className="drive-lead">Google Drive sync isn’t set up on this site yet.</p>
          <details className="drive-advanced">
            <summary>Advanced: I host this copy myself</summary>
            <p className="drive-note">
              The simplest setup is on the server: set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and{' '}
              <code>SESSION_SECRET</code> (see the README), and this dialog becomes a single Connect button. Without a server you can paste a
              Web application OAuth client ID that lists <code>{window.location.origin}</code> as an authorised JavaScript origin; you will then
              sign in again about once an hour.
            </p>
            <Field label="OAuth client ID">
              <input
                className="input mono"
                placeholder="1234567890-abc.apps.googleusercontent.com"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                spellCheck={false}
              />
            </Field>
          </details>
        </>
      ) : (
        <p className="drive-lead">
          Keep your plans in Google Drive and continue from any device. The app creates a <strong>{FOLDER_NAME}</strong> folder and can only see
          files it made there.
          {mode === 'server' && ' You will be taken to Google to allow access, then brought straight back.'}
        </p>
      )}
      {error && <p className="drive-error">{error}</p>}
    </Modal>
  )
}
