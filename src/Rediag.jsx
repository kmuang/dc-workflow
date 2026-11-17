import { useEffect, useMemo, useRef, useState } from 'react'
import { diagnose } from './sim.js'
import { Lamp } from './ui.jsx'

const AREAS = [
  ['all', 'All'],
  ['optic', 'Optics'],
  ['power', 'Power'],
  ['cooling', 'Cooling'],
]

export function Rediag({ snap, actions }) {
  const checks = useMemo(() => diagnose(snap), [snap])
  const checksRef = useRef(checks)
  checksRef.current = checks
  const [area, setArea] = useState('all')
  const [running, setRunning] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [done, setDone] = useState(Boolean(actions.work.lastRediag))
  const reveal = running ? cursor : done || actions.work.lastRediag ? checks.length : 0
  const shown = checks.slice(0, reveal).filter((c) => area === 'all' || c.area === area)
  const recordRef = useRef(actions.recordRediag)
  recordRef.current = actions.recordRediag

  useEffect(() => {
    if (!running) return undefined
    if (cursor >= checksRef.current.length) {
      const rows = checksRef.current
      setRunning(false)
      setDone(true)
      recordRef.current({
        at: Date.now(),
        fail: rows.filter((c) => c.state === 'fail').length,
        warn: rows.filter((c) => c.state === 'warn').length,
        opticPass: rows.filter((c) => c.fault).every((c) => c.state === 'ok'),
      })
      return undefined
    }
    const timer = setTimeout(() => setCursor((n) => n + 1), 110)
    return () => clearTimeout(timer)
  }, [running, cursor])

  function run() {
    setDone(false)
    setCursor(0)
    setRunning(true)
  }

  const fail = checks.filter((c) => c.state === 'fail').length
  const warn = checks.filter((c) => c.state === 'warn').length

  return (
    <div className="stack">
      <section className="method-intro">
        <div>
          <p className="eyebrow">Hardware rediag</p>
          <h2>Prove the chassis, not just the ping</h2>
          <p>
            A clean probe only says traffic is flowing. Rediag walks power, fans, temperature, and every optic:
            receive light, transmit light, optic temperature, CRC rate, and uncorrectable FEC. Run it again after each part you replace. The sign-off is a pass with nothing left in the fail or warn column.
          </p>
        </div>
      </section>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={run} disabled={running}>
          {running ? 'Running…' : actions.work.lastRediag ? 'Run rediag again' : 'Run rediag'}
        </button>
        <div className="seg" role="tablist">
          {AREAS.map(([id, label]) => (
            <button key={id} className={area === id ? 'on' : ''} onClick={() => setArea(id)}>{label}</button>
          ))}
        </div>
        {actions.work.lastRediag && !running && (
          <span className="dim">
            Last run {fail} fail · {warn} warn
            {actions.work.lastRediag.opticPass ? ' · optic pass' : ' · optic still bad'}
          </span>
        )}
      </div>

      <section className="panel">
        <header className="panel-h">
          <h2>{reveal === 0 ? 'Waiting' : `${Math.min(reveal, checks.length)} / ${checks.length} checks`}</h2>
          <span>{running ? 'Reading hardware' : 'DCA1 chassis'}</span>
        </header>
        {reveal === 0 ? (
          <p className="empty">No rediag yet. The run covers six chassis and eight fabric optics.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Result</th>
                <th>Reading</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((check) => (
                <tr key={check.id}>
                  <td>
                    <Lamp health={check.state === 'fail' ? 'crit' : check.state === 'warn' ? 'warn' : 'ok'} />
                    {check.name}
                    {check.peer && <span className="dim"> → {check.peer}</span>}
                  </td>
                  <td className={check.state === 'fail' ? 'crit' : check.state === 'warn' ? 'warn' : 'ok'}>
                    {check.state}
                  </td>
                  <td className="dim">{check.detail}</td>
                  <td>
                    {check.id === 'leaf-04-power' && check.state === 'fail' && (
                      <button className="btn" onClick={actions.replacePsu}>Replace PSU</button>
                    )}
                    {check.id === 'spine-b-cool' && check.state === 'warn' && (
                      <button className="btn" onClick={actions.replaceFan}>Replace fan</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
