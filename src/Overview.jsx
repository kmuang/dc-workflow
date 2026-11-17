import { fmtMs, fmtPct } from './sim.js'
import { Lamp, Meter, Spark } from './ui.jsx'

export function Overview({ snap, onOpen, onRepair }) {
  const rank = { crit: 3, warn: 2, admin: 1, ok: 0 }
  const hottest = [...snap.links]
    .sort((a, b) => rank[b.health] - rank[a.health] || b.util - a.util)
    .slice(0, 5)
  return (
    <div className="stack">
      <section className={`banner ${snap.incident.level}`}>
        <div>
          <p className="eyebrow">Active picture</p>
          <h2>{snap.incident.title}</h2>
          <p>{snap.incident.body}</p>
        </div>
        <div className="banner-actions">
          <button className="btn btn-primary" onClick={onOpen}>Run the method</button>
          <button className="btn" onClick={onRepair}>Finish repair</button>
        </div>
      </section>

      <section className="kpis">
        <article className="kpi">
          <span>Devices up</span>
          <strong>
            {snap.kpis.deviceUp}
            <small>/{snap.kpis.deviceTotal}</small>
          </strong>
          <em>Spines and leaves answering</em>
        </article>
        <article className="kpi">
          <span>Links needing a look</span>
          <strong className={snap.kpis.degraded ? 'crit' : 'ok'}>{snap.kpis.degraded}</strong>
          <em>Crit or hot, of {snap.links.length} fabric links</em>
        </article>
        <article className="kpi">
          <span>Rack C14 loss</span>
          <strong className={snap.kpis.c14Loss > 0.2 ? 'crit' : 'ok'}>{fmtPct(snap.kpis.c14Loss)}</strong>
          <em>Mesh probers behind TOR-C14</em>
        </article>
        <article className="kpi">
          <span>Rack C14 latency</span>
          <strong className={snap.kpis.c14Latency > 5 ? 'crit' : 'ok'}>{fmtMs(snap.kpis.c14Latency)}</strong>
          <em>Other racks stay under 1 ms</em>
        </article>
      </section>

      <div className="split">
        <section className="panel">
          <header className="panel-h">
            <h2>Rack probes</h2>
            <span>Where the pain is</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Rack</th>
                <th>ToR</th>
                <th className="num">Hosts</th>
                <th className="num">Loss</th>
                <th className="num">Latency</th>
              </tr>
            </thead>
            <tbody>
              {snap.racks.map((r) => (
                <tr key={r.rack}>
                  <td>
                    <Lamp health={r.health} /> {r.rack}
                  </td>
                  <td>{r.leafName}</td>
                  <td className="num">{r.hosts}</td>
                  <td className={`num ${r.loss > 0.2 ? 'crit' : ''}`}>{fmtPct(r.loss)}</td>
                  <td className="num">{fmtMs(r.latencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <header className="panel-h">
            <h2>Alerts</h2>
            <span>Newest first</span>
          </header>
          <ul className="alerts">
            {snap.alerts.map((a, i) => (
              <li key={i} className={a.level}>
                <Lamp health={a.level === 'info' ? 'ok' : a.level === 'warn' ? 'warn' : a.level === 'ok' ? 'ok' : 'crit'} />
                <div>
                  <time>{a.time}</time>
                  <p>{a.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel">
        <header className="panel-h">
          <h2>Fabric uplinks</h2>
          <span>Utilization, last two minutes</span>
        </header>
        <table>
          <thead>
            <tr>
              <th>Link</th>
              <th>State</th>
              <th>Util</th>
              <th className="num">Loss</th>
              <th className="num">CRC/s</th>
              <th className="num">Rx dBm</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {hottest.map((l) => {
              const a = snap.devices.find((d) => d.id === l.a)
              const b = snap.devices.find((d) => d.id === l.b)
              return (
                <tr key={l.id}>
                  <td>
                    {a.name} {l.aIf}
                    <span className="dim"> → {b.name} {l.bIf}</span>
                  </td>
                  <td>
                    <Lamp health={l.health} /> {l.health === 'admin' ? 'drained' : l.health === 'crit' ? 'errors' : l.health === 'warn' ? 'hot' : 'up'}
                  </td>
                  <td className="util">
                    <Meter value={l.util} />
                    <span className="num">{l.util.toFixed(0)}%</span>
                  </td>
                  <td className={`num ${l.loss > 0.2 ? 'crit' : ''}`}>{fmtPct(l.loss)}</td>
                  <td className={`num ${l.crcRate > 0 ? 'crit' : ''}`}>{l.crcRate}</td>
                  <td className={`num ${l.rxDbm < -8 ? 'crit' : ''}`}>{l.rxDbm.toFixed(1)}</td>
                  <td>
                    <Spark values={l.history} tone={l.health === 'crit' ? 'crit' : l.health === 'warn' ? 'warn' : 'info'} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
