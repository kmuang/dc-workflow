import { useMemo, useState } from 'react'
import { fabricLogs, LOG_SEVERITIES } from './logs.js'
import { Lamp } from './ui.jsx'

const PRESETS = [
  ['all', ''],
  ['crc', 'crc'],
  ['optics', 'rx power'],
  ['power', 'PSU'],
  ['fans', 'FAN'],
  ['audit', ''],
]

export function Logs({ snap, actions }) {
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('all')
  const [device, setDevice] = useState('all')
  const [source, setSource] = useState('all')
  const [follow, setFollow] = useState(true)
  const [frozen, setFrozen] = useState(null)
  const [copied, setCopied] = useState(false)

  const live = useMemo(
    () => fabricLogs(snap, {
      audit: actions.log,
      psuAt: actions.work.psuAt,
      fanAt: actions.work.fanAt,
    }),
    [snap, actions.log, actions.work.psuAt, actions.work.fanAt],
  )
  const buffer = follow ? live : frozen || live

  const devices = ['all', ...new Set(live.map((row) => row.device))]
  const needle = query.trim().toLowerCase()
  const shown = buffer.filter((row) => {
    if (severity !== 'all' && row.severity !== severity) return false
    if (device !== 'all' && row.device !== device) return false
    if (source !== 'all' && row.source !== source) return false
    if (!needle) return true
    return `${row.device} ${row.severity} ${row.facility} ${row.message}`.toLowerCase().includes(needle)
  })
  const newestFirst = [...shown].reverse()
  const recentErrors = live.filter((row) => (row.severity === 'error' || row.severity === 'critical') && snap.now - row.ts < 5 * 60e3).length

  function toggleFollow() {
    if (follow) setFrozen(live)
    else setFrozen(null)
    setFollow((value) => !value)
  }

  async function copyVisible() {
    const text = newestFirst
      .slice()
      .reverse()
      .map((row) => `${row.time} ${row.device} ${row.severity} ${row.facility} ${row.message}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="stack">
      <section className="method-intro">
        <div>
          <p className="eyebrow">Log collector</p>
          <h2>One buffer for the fabric and the jump host</h2>
          <p>
            Chassis syslog and operator actions land in the same buffer. Search it before you trust a single alarm. Follow stays on the live tail. Pause follow when you need the page to hold still.
          </p>
        </div>
      </section>

      <section className="kpis">
        <article className="kpi">
          <span>Buffer</span>
          <strong>{live.length}</strong>
          <em>Kept for this lab window</em>
        </article>
        <article className="kpi">
          <span>Matching</span>
          <strong>{shown.length}</strong>
          <em>After the current filter</em>
        </article>
        <article className="kpi">
          <span>Errors, 5 min</span>
          <strong className={recentErrors ? 'crit' : 'ok'}>{recentErrors}</strong>
          <em>Critical and error</em>
        </article>
        <article className="kpi">
          <span>Tail</span>
          <strong className={follow ? 'ok' : 'warn'}>{follow ? 'live' : 'paused'}</strong>
          <em>{follow ? 'New lines append' : 'Frozen at pause'}</em>
        </article>
      </section>

      <div className="toolbar">
        <label className="search">
          <span className="sr">Search logs</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search device, facility, message"
          />
        </label>
        <select className="log-select" value={device} onChange={(event) => setDevice(event.target.value)} aria-label="Device">
          {devices.map((name) => (
            <option key={name} value={name}>{name === 'all' ? 'All devices' : name}</option>
          ))}
        </select>
        <select className="log-select" value={source} onChange={(event) => setSource(event.target.value)} aria-label="Source">
          <option value="all">Syslog and audit</option>
          <option value="syslog">Syslog only</option>
          <option value="audit">Audit only</option>
        </select>
        <button className={follow ? 'btn btn-primary' : 'btn'} onClick={toggleFollow}>
          {follow ? 'Following' : 'Follow'}
        </button>
        <button className="btn" onClick={copyVisible}>{copied ? 'Copied' : 'Copy view'}</button>
      </div>

      <div className="seg" role="tablist" aria-label="Severity">
        <button className={severity === 'all' ? 'on' : ''} onClick={() => setSeverity('all')}>all</button>
        {LOG_SEVERITIES.map((level) => (
          <button key={level} className={severity === level ? 'on' : ''} onClick={() => setSeverity(level)}>{level}</button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Saved searches">
        {PRESETS.map(([id, text]) => (
          <button
            key={id}
            className={presetOn(id, text, query, source, severity) ? 'on' : ''}
            onClick={() => {
              setQuery(text)
              setSource(id === 'audit' ? 'audit' : 'all')
              setSeverity('all')
            }}
          >
            {id}
          </button>
        ))}
      </div>

      <section className="panel">
        <header className="panel-h">
          <h2>{newestFirst.length} lines</h2>
          <span>Newest first</span>
        </header>
        {newestFirst.length === 0 ? (
          <p className="empty">Nothing in the buffer matches that filter.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Device</th>
                <th>Severity</th>
                <th>Facility</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((row) => (
                <tr key={row.id}>
                  <td className="mono">{row.time}</td>
                  <td>{row.device}</td>
                  <td className={sevClass(row.severity)}>
                    <Lamp health={lampFor(row.severity)} />{row.severity}
                  </td>
                  <td className="dim">{row.facility}</td>
                  <td>{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function presetOn(id, text, query, source, severity) {
  if (id === 'audit') return source === 'audit' && !query
  if (id === 'all') return !query && source === 'all' && severity === 'all'
  return query === text && source === 'all'
}

function sevClass(severity) {
  if (severity === 'critical' || severity === 'error') return 'crit'
  if (severity === 'warning') return 'warn'
  return ''
}

function lampFor(severity) {
  if (severity === 'critical' || severity === 'error') return 'crit'
  if (severity === 'warning') return 'warn'
  if (severity === 'notice') return 'info'
  return 'ok'
}
