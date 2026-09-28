import { Cloud, RefreshCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Field, Segmented } from '../ui'
import { FOLDER_NAME } from './drive'
import { hasDropbox } from './dropbox'
import { PROVIDER_NAME, type ProviderId } from './provider'
import { useSync, type SyncStatus } from './syncStore'

export const LABEL: Record<SyncStatus, string> = {
  off: 'Not connected',
  idle: 'Synced',
  syncing: 'Syncing…',
  'needs-auth': 'Reconnect',
  error: 'Sync error',
}

export function ago(t: number | null) {
  if (!t) return 'not yet'
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(t).toLocaleDateString()
}

/** Where each service keeps the files, for the explanations below. */
const WHERE: Record<ProviderId, ReactNode> = {
  drive: (
    <>
      the <strong>{FOLDER_NAME}</strong> folder in your Drive
    </>
  ),
  dropbox: (
    <>
      the <strong>Apps/{FOLDER_NAME}</strong> folder in your Dropbox
    </>
  ),
}

/** Cloud sync section of the settings dialog: pick Google Drive or Dropbox, connect, and see the status. */
export function SyncPanel({ onClose }: { onClose: () => void }) {
  const { status, error, lastSync, provider, mode, connect, disconnect, syncNow } = useSync()
  const [choice, setChoice] = useState<ProviderId>(provider ?? 'drive')
  const [clientId, setClientId] = useState('')
  const [, tick] = useState(0)

  useEffect(() => {
    // Keep "synced 2 min ago" fresh while settings are open.
    const t = setInterval(() => tick((n) => n + 1), 15000)
    return () => clearInterval(t)
  }, [])

  if (provider) {
    const name = PROVIDER_NAME[provider]
    return (
      <div className="drive-panel">
        <p className="drive-lead">
          Connected to <strong>{name}</strong>. Plans and custom components are saved to {WHERE[provider]}. Changes sync on their own a few
          seconds after you make them. To carry on from another device, open the app there and connect the same account.
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
            {provider === 'drive' && mode !== 'server'
              ? 'Google sign-ins last an hour on this site. Connect again to keep syncing; nothing is lost meanwhile.'
              : `${name} access was removed or has expired. Connect again to keep syncing; nothing is lost meanwhile.`}
          </p>
        )}
        {error && <p className="drive-error">{error}</p>}
        <div className="drive-actions">
          <button className="btn ghost" onClick={() => void disconnect()}>
            Disconnect
          </button>
          {status === 'needs-auth' ? (
            <button className="btn primary" onClick={() => void connect(provider)}>
              <Cloud size={14} /> Connect again
            </button>
          ) : (
            <button className="btn primary" disabled={status === 'syncing'} onClick={() => void syncNow()}>
              <RefreshCw size={14} className={status === 'syncing' ? 'spin' : undefined} /> Sync now
            </button>
          )}
        </div>
      </div>
    )
  }

  const driveMissing = choice === 'drive' && mode === 'none'
  const leaves = choice === 'dropbox' || mode === 'server'

  return (
    <div className="drive-panel">
      <Segmented
        value={choice}
        options={[
          { value: 'drive', label: PROVIDER_NAME.drive },
          { value: 'dropbox', label: PROVIDER_NAME.dropbox },
        ]}
        onChange={setChoice}
      />
      {choice === 'dropbox' && !hasDropbox ? (
        <>
          <p className="drive-lead">Dropbox sync isn’t set up on this site yet.</p>
          <p className="drive-note">
            If you host this copy yourself, create a Dropbox app with <em>App folder</em> access, add <code>{window.location.origin}/</code> as a
            redirect URI, and build with its key in <code>VITE_DROPBOX_APP_KEY</code> (see the README).
          </p>
        </>
      ) : driveMissing ? (
        <>
          <p className="drive-lead">Google Drive sync isn’t set up on this site yet.</p>
          <details className="drive-advanced">
            <summary>Advanced: I host this copy myself</summary>
            <p className="drive-note">
              The simplest setup is on the server: set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and{' '}
              <code>SESSION_SECRET</code> (see the README), and this becomes a single Connect button. Without a server you can paste a Web
              application OAuth client ID that lists <code>{window.location.origin}</code> as an authorised JavaScript origin; you will then sign
              in again about once an hour.
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
          Keep your plans in {PROVIDER_NAME[choice]} and continue from any device. The app keeps them in {WHERE[choice]} and can only see
          files there.
          {leaves && ` You will be taken to ${PROVIDER_NAME[choice]} to allow access, then brought straight back.`}{' '}
          <Link to="/privacy" onClick={onClose}>
            Privacy
          </Link>
        </p>
      )}
      {error && <p className="drive-error">{error}</p>}
      <div className="drive-actions">
        <button
          className="btn primary"
          disabled={(choice === 'drive' && mode === null) || (choice === 'dropbox' && !hasDropbox) || (driveMissing && !clientId.trim())}
          onClick={() => void connect(choice, driveMissing ? clientId : undefined)}
        >
          <Cloud size={14} /> Connect {PROVIDER_NAME[choice]}
        </button>
      </div>
    </div>
  )
}
