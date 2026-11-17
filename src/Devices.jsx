import { useMemo, useState } from 'react'
import { fmtMs, fmtPct } from './sim.js'
import { Lamp, Meter, healthLabel } from './ui.jsx'

export function Devices({ snap }) {
  const [tab, setTab] = useState('nodes')
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')

  const nodes = useMemo(() => {
    const query = q.trim().toLowerCase()
    const deviceRows = snap.devices.map((d) => ({
      id: d.id,
      health: d.health,
      name: d.name,
      role: d.role,
      where: d.rack,
      addr: d.mgmt,
      loss: null,
      latencyMs: null,
      extra: `CPU ${d.cpu.toFixed(0)}% · SDN ${d.bgp}`,
    }))
    const hostRows = snap.hosts.map((h) => ({
      id: h.id,
      health: h.health,
      name: h.name,
      role: h.role,
      where: h.rack,
      addr: h.ip,
      loss: h.loss,
      latencyMs: h.latencyMs,
      extra: snap.devices.find((d) => d.id === h.leaf).name,
    }))
    return [...deviceRows, ...hostRows]
      .filter((r) => role === 'all' || r.role === role || (role === 'host' && (r.role === 'app' || r.role === 'payments')))
      .filter((r) => !query || `${r.name} ${r.where} ${r.addr} ${r.role}`.toLowerCase().includes(query))
      .sort((a, b) => (b.loss || 0) - (a.loss || 0) || a.name.localeCompare(b.name))
  }, [snap, q, role])

  const links = [...snap.links].sort((a, b) => b.loss - a.loss || b.util - a.util)

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="seg" role="tablist">
          <button className={tab === 'nodes' ? 'on' : ''} onClick={() => setTab('nodes')}>Nodes</button>
          <button className={tab === 'links' ? 'on' : ''} onClick={() => setTab('links')}>Uplinks</button>
        </div>
        {tab === 'nodes' && (
          <>
            <label className="search">
              <span className="sr">Filter</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter name, rack, address"
              />
            </label>
            <div className="seg">
              {['all', 'spine', 'tor', 'host'].map((r) => (
                <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                  {r}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {tab === 'nodes' ? (
        <section className="panel">
          <header className="panel-h">
            <h2>{nodes.length} nodes</h2>
            <span>Sorted by loss</span>
          </header>
          {nodes.length === 0 ? (
            <p className="empty">Nothing matches that filter.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Rack</th>
                  <th>Address</th>
                  <th className="num">Loss</th>
                  <th className="num">Latency</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id}>
                    <td><Lamp health={n.health} /> {n.name}</td>
                    <td>{n.role}</td>
                    <td>{n.where}</td>
                    <td className="mono">{n.addr}</td>
                    <td className={`num ${n.loss > 0.2 ? 'crit' : ''}`}>{n.loss == null ? '—' : fmtPct(n.loss)}</td>
                    <td className="num">{n.latencyMs == null ? '—' : fmtMs(n.latencyMs)}</td>
                    <td className="dim">{n.extra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="panel">
          <header className="panel-h">
            <h2>Leaf to spine</h2>
            <span>Dirty members sort first</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>State</th>
                <th>Util</th>
                <th className="num">Loss</th>
                <th className="num">Latency</th>
                <th className="num">CRC/s</th>
                <th className="num">Rx</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td>
                    {nameOf(snap, l.a)} {l.aIf}
                    <span className="dim"> ↔ {nameOf(snap, l.b)} {l.bIf}</span>
                  </td>
                  <td><Lamp health={l.health} /> {healthLabel(l.health)}</td>
                  <td className="util"><Meter value={l.util} /><span className="num">{l.util.toFixed(0)}%</span></td>
                  <td className={`num ${l.loss > 0.2 ? 'crit' : ''}`}>{fmtPct(l.loss)}</td>
                  <td className="num">{fmtMs(l.latencyMs)}</td>
                  <td className={`num ${l.crcRate ? 'crit' : ''}`}>{l.crcRate}</td>
                  <td className={`num ${l.rxDbm < -8 ? 'crit' : ''}`}>{l.rxDbm.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function nameOf(snap, id) {
  return snap.devices.find((d) => d.id === id)?.name ?? id
}
