import { Link } from 'react-router'
import { ThemePicker } from '../ui'
import { LegalFooter } from './Legal'
import { author, bugs, license, version } from '../../package.json'
import './legal.css'

const EMAIL = author.email
const SITE = author.url
const ISSUES = bugs.url
const REPO = ISSUES.replace(/\/issues$/, '')

export function AboutPage() {
  return (
    <div className="legal">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          Floor Plan Studio
        </Link>
        <div className="spacer" />
        <ThemePicker />
        <Link to="/" className="btn">
          Open the app
        </Link>
      </header>
      <main className="legal-main">
        <div className="eyebrow">About</div>
        <h1>Floor Plan Studio</h1>
        <p>
          A free floor plan editor that runs in your browser. Draw walls and rooms, place doors, windows and furniture, design your own
          components, and export to PDF, PNG or SVG. No account needed: plans stay on your device, or in your own Google Drive if you connect it.
        </p>

        <h2>Why I built it</h2>
        <p>
          Mostly to plan my own home. I wanted to try out layouts before moving furniture around, and the planners I found were paid, heavy, or
          wanted an account before I could draw a single wall. So I made a simple one, and it doubled as a fun side project to learn from.
        </p>

        <h2>Who made it</h2>
        <p>
          Made by {author.name}. Find me at{' '}
          <a href={SITE} target="_blank" rel="noreferrer">
            epsilonpi.dev
          </a>
          {' '}or email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>

        <h2>Source and feedback</h2>
        <p>
          The code is on{' '}
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          . Found a bug or have an idea?{' '}
          <a href={ISSUES} target="_blank" rel="noreferrer">
            Open an issue
          </a>
          {' '}or <a href={`mailto:${EMAIL}`}>send an email</a>.
        </p>

        <p className="mono about-meta">
          Version {version} · {license} License
        </p>
        <LegalFooter />
      </main>
    </div>
  )
}
