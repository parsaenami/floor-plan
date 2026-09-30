import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { FOLDER_NAME } from '../sync/drive'
import './legal.css'
import { SettingsButton } from '../settings/SettingsButton'

/*
 * Privacy policy and terms, linked from Google's consent screen (Branding) and
 * the app. Keep them in step with the code: what is stored where, and what the
 * Drive integration can see. Whoever hosts a copy sets the contact details:
 *   VITE_CONTACT_EMAIL  required before publishing the Google app
 *   VITE_OPERATOR_NAME  optional, the person or company running the site
 */

const UPDATED = '28 September 2026'
const EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || undefined
const OPERATOR = (import.meta.env.VITE_OPERATOR_NAME as string | undefined)?.trim() || undefined

const operator = OPERATOR ?? 'the person or organisation that runs this site'

function Contact() {
  return EMAIL ? <a href={`mailto:${EMAIL}`}>{EMAIL}</a> : <>the site’s operator</>
}

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal">
      <header className="topbar page-bar">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          Floor Plan Studio
        </Link>
        <div className="spacer" />
        <SettingsButton />
        <Link to="/" className="btn">
          Open the app
        </Link>
      </header>
      <main className="legal-main">
        <div className="eyebrow">Last updated {UPDATED}</div>
        <h1>{title}</h1>
        {children}
        <LegalFooter />
      </main>
    </div>
  )
}

/** Links to both pages; shown under the dashboard too. */
export function LegalFooter() {
  return (
    <footer className="legal-foot mono">
      <Link to="/about">About</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
      {EMAIL && <a href={`mailto:${EMAIL}`}>Contact</a>}
    </footer>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Floor Plan Studio is a floor plan editor that runs in your browser. It is run by {operator}. This page explains what the app stores,
        where, and what it can see when you connect Google Drive or Dropbox. In short: there are no accounts, no database and no analytics, and your plans
        stay with you.
      </p>

      <h2>Your plans stay in your browser</h2>
      <p>
        Plans, custom components and settings (such as the theme) are saved in your browser’s own storage on your device. They are not sent to
        this site’s server. Clearing this site’s data in your browser deletes them, so export plans or connect Google Drive or Dropbox if you want a copy
        elsewhere.
      </p>
      <p>
        A share link contains the whole plan inside the link itself, after the #, which browsers do not send to the server. Anyone you give the link
        to can see the plan.
      </p>

      <h2>Google Drive (optional)</h2>
      <p>If you choose to connect Google Drive:</p>
      <ul>
        <li>
          The app asks Google for the <code>drive.file</code> permission only. With it, the app can see and change only the files it created
          itself, which it keeps in a <strong>{FOLDER_NAME}</strong> folder. It cannot see, read or change any other file in your Drive.
        </li>
        <li>
          It uses that access for one thing: saving your plans and custom components there and reading them back, so you can continue on another
          device.
        </li>
        <li>
          Your files travel directly between your browser and Google. They do not pass through this site’s server, and it keeps no copy of them.
        </li>
        <li>
          To keep you connected, the server receives a sign-in token from Google. It stores it encrypted in a cookie in your browser, not on the
          server. The server uses it only to get short-lived access tokens for your browser. It does not read your name, email address or
          profile.
        </li>
        <li>
          You can disconnect at any time with <em>Disconnect</em> in the app’s Google Drive dialog, which also revokes the app’s access. You can
          also remove access from your{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            Google Account permissions
          </a>
          . Files the app already saved stay in your Drive until you delete them.
        </li>
      </ul>
      <p>
        Floor Plan Studio’s use and transfer of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Data from Google is never sold, never used for advertising, never shared with anyone else
        and never used to train AI models, and no person reads it.
      </p>

      <h2>Dropbox (optional)</h2>
      <p>If you choose to connect Dropbox instead:</p>
      <ul>
        <li>
          The app uses Dropbox’s <em>App folder</em> access. It can see and change only the <strong>Apps/{FOLDER_NAME}</strong> folder in your
          Dropbox, and nothing else.
        </li>
        <li>It uses that access only to save your plans and custom components there and read them back.</li>
        <li>
          Sign-in happens between your browser and Dropbox; this site’s server is not involved. Dropbox gives the app a sign-in token, which is
          kept in your browser’s storage on this device. It does not read your name, email address or profile.
        </li>
        <li>
          <em>Disconnect</em> in the app’s settings revokes the token. You can also remove access in your{' '}
          <a href="https://www.dropbox.com/account/connected_apps" target="_blank" rel="noreferrer">
            Dropbox connected apps
          </a>
          . Files the app already saved stay in your Dropbox until you delete them.
        </li>
      </ul>
      <p>Data from Dropbox is never sold, never used for advertising, never shared with anyone else and never used to train AI models.</p>

      <h2>Cookies and browser storage</h2>
      <p>The app does not use tracking or advertising cookies. It sets these only when you connect Google Drive:</p>
      <ul>
        <li>
          <code>fps_oauth</code>: holds a one-time security code while you sign in with Google. It expires after 10 minutes.
        </li>
        <li>
          <code>fps_drive</code>: the encrypted Google sign-in token described above. It lasts up to 180 days, or until you disconnect.
        </li>
      </ul>
      <p>If you connect Dropbox, its sign-in token is kept in this site’s browser storage until you disconnect.</p>

      <h2>Other services</h2>
      <ul>
        <li>
          Fonts are loaded from Google Fonts, so Google receives your IP address and browser details when the page loads (see{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            Google’s privacy policy
          </a>
          ).
        </li>
        <li>
          Like any website, the server or hosting provider that delivers this site may keep standard access logs, such as IP address, time and
          requested page, for security and troubleshooting. They are not used to identify or profile you.
        </li>
      </ul>

      <h2>Children</h2>
      <p>The app is not directed at children under 13 and does not knowingly collect information about anyone.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the new version will be posted here with a new date.</p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Contact <Contact />.
      </p>
    </LegalPage>
  )
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms cover your use of Floor Plan Studio, run by {operator}. By using the app, you agree to them. If you don’t agree, please
        don’t use it.
      </p>

      <h2>The service</h2>
      <p>
        Floor Plan Studio is a free tool for drawing floor plans in your browser. It may change, gain or lose features, or stop running at any
        time, with or without notice.
      </p>

      <h2>Your content</h2>
      <p>
        The plans and components you make are yours. They are stored in your browser, and in your own Google Drive or Dropbox if you connect one (see the{' '}
        <Link to="/privacy">privacy policy</Link>). You are responsible for keeping backups. Export plans you care about, because clearing your
        browser’s data deletes the local copy.
      </p>

      <h2>Not professional advice</h2>
      <p>
        Plans, measurements and areas produced by the app are for planning and illustration only. They are not construction, architectural or
        survey documents. Check every measurement yourself, and consult a qualified professional before building, renovating or buying.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don’t use the app to break the law, and don’t try to disrupt the site, get around its security or overload it. When you connect Google
        Drive or Dropbox, that service’s own terms also apply to your use of it.
      </p>

      <h2>No warranty</h2>
      <p>
        The app is provided “as is” and “as available”, without warranties of any kind, including that it will be accurate, reliable,
        uninterrupted or free of errors, or that it won’t lose data.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, {OPERATOR ?? 'the operator'} is not liable for any indirect or consequential loss, or for lost
        data, profits or time, arising from your use of the app.
      </p>

      <h2>Changes</h2>
      <p>These terms may be updated. The new version will be posted here with a new date, and continuing to use the app means you accept it.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Contact <Contact />.
      </p>
    </LegalPage>
  )
}
