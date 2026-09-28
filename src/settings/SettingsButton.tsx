import { Settings } from 'lucide-react'
import { useState } from 'react'
import { Modal, ThemePicker } from '../ui'
import { SyncPanel, LABEL, ago } from '../sync/SyncPanel'
import { PROVIDER_NAME } from '../sync/provider'
import { useSync } from '../sync/syncStore'

/** Top-bar gear that opens the settings dialog (theme and cloud sync). */
export function SettingsButton() {
  const status = useSync((s) => s.status)
  const lastSync = useSync((s) => s.lastSync)
  const provider = useSync((s) => s.provider)
  const [open, setOpen] = useState(false)
  // Sync problems would otherwise be hidden behind the gear, so flag them on it.
  const alert = status === 'needs-auth' || status === 'error'
  const name = provider ? PROVIDER_NAME[provider] : ''
  const sync = !provider ? '' : status === 'idle' ? ` · ${name} synced ${ago(lastSync)}` : ` · ${name}: ${LABEL[status]}`
  return (
    <>
      <button className={`icon-btn settings-btn${alert ? ' alert' : ''}`} title={`Settings${sync}`} aria-label="Settings" onClick={() => setOpen(true)}>
        <Settings size={16} />
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Theme</h3>
        <ThemePicker />
      </section>
      <section className="settings-section">
        <h3>Cloud sync</h3>
        <SyncPanel onClose={onClose} />
      </section>
    </Modal>
  )
}
