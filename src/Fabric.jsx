import { useState } from 'react'
import { fmtMs, fmtPct } from './sim.js'
import { Lamp, Meter, healthLabel } from './ui.jsx'

const LEAF_X = { 'leaf-01': 36, 'leaf-02': 246, 'leaf-03': 456, 'leaf-04': 666 }
const SPINE_X = { 'spine-a': 200, 'spine-b': 500 }
const SPINE_Y = 28
const LEAF_Y = 210
const NODE_W = 148
const NODE_H = 52

export function Fabric({ snap }) {
  const [sel, setSel] = useState({ kind: 'link', id: 'leaf-03--spine-b' })
  const selected = resolve(snap, sel)

  return (
    <div className="fabric-layout">
      <section className="panel svg-panel">
        <header className="panel-h">
          <h2>DCA1 Jupiter Clos</h2>
          <span>Click a node or a link</span>
        </header>
        <svg viewBox="0 0 860 460" className="fabric" role="img" aria-label="Jupiter Clos topology">
          {snap.links.map((l) => {
            const x1 = centerX(l.b)
            const y1 = SPINE_Y + NODE_H
            const x2 = centerX(l.a)
            const y2 = LEAF_Y
            const midX = (x1 + x2) / 2
            const midY = (y1 + y2) / 2
            const on = sel.kind === 'link' && sel.id === l.id
            return (
              <g key={l.id} className={`link ${l.health} ${on ? 'on' : ''}`} onClick={() => setSel({ kind: 'link', id: l.id })}>
                <title>
                  {nameOf(snap, l.a)} {l.aIf} to {nameOf(snap, l.b)} {l.bIf}: {l.util.toFixed(0)}% util, {fmtPct(l.loss)} loss
                </title>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="hit" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="wire" strokeWidth={on ? 3.2 : 1.6 + l.util / 70} />
                {l.health !== 'ok' && (
                  <text x={midX} y={midY - 6} textAnchor="middle" className="link-label">
                    {l.health === 'admin' ? 'weight 0' : l.health === 'crit' ? 'FEC' : 'hot'}
                  </text>
                )}
              </g>
            )
          })}

          {snap.devices.filter((d) => d.role === 'spine').map((d) => (
            <Node key={d.id} d={d} x={SPINE_X[d.id]} y={SPINE_Y} on={sel.kind === 'device' && sel.id === d.id} onPick={() => setSel({ kind: 'device', id: d.id })} />
          ))}
          {snap.devices.filter((d) => d.role === 'tor').map((d) => (
            <Node key={d.id} d={d} x={LEAF_X[d.id]} y={LEAF_Y} on={sel.kind === 'device' && sel.id === d.id} onPick={() => setSel({ kind: 'device', id: d.id })} />
          ))}

          {Object.entries(LEAF_X).map(([leafId, x]) => {
            const hosts = snap.hosts.filter((h) => h.leaf === leafId)
            return hosts.map((h, i) => (
              <rect
                key={h.id}
                x={x + 10 + i * 34}
                y={392}
                width="26"
                height="18"
                rx="2"
                className={`host-pip ${h.health} ${sel.kind === 'host' && sel.id === h.id ? 'on' : ''}`}
                onClick={() => setSel({ kind: 'host', id: h.id })}
              >
                <title>{h.name} {fmtPct(h.loss)} loss</title>
              </rect>
            ))
          })}
          <text x="36" y="430" className="svg-note">Mesh probers under each ToR. Red means that rack is losing packets.</text>
        </svg>
      </section>

      <aside className="panel detail">
        {selected?.kind === 'link' && <LinkDetail snap={snap} link={selected.item} />}
        {selected?.kind === 'device' && <DeviceDetail device={selected.item} snap={snap} />}
        {selected?.kind === 'host' && <HostDetail host={selected.item} snap={snap} />}
      </aside>
    </div>
  )
}

function Node({ d, x, y, on, onPick }) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={`node ${on ? 'on' : ''}`}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick()
      }}
    >
      <rect width={NODE_W} height={NODE_H} rx="4" />
      <circle cx="16" cy="26" r="4.5" className={`pip ${d.health}`} />
      <text x="30" y="22">{d.name}</text>
      <text x="30" y="38" className="sub">{d.role} · {d.rack}</text>
    </g>
  )
}

function LinkDetail({ snap, link }) {
  const a = snap.devices.find((d) => d.id === link.a)
  const b = snap.devices.find((d) => d.id === link.b)
  return (
    <>
      <header className="panel-h">
        <h2>Uplink</h2>
        <span>{healthLabel(link.health)}</span>
      </header>
      <h3 className="detail-title">
        <Lamp health={link.health} /> {a.name} {link.aIf}
      </h3>
      <p className="dim">to {b.name} {link.bIf} · {link.speed}G</p>
      <dl className="facts">
        <div><dt>Utilization</dt><dd><Meter value={link.util} /> {link.util.toFixed(0)}%</dd></div>
        <div><dt>Loss</dt><dd className={link.loss > 0.2 ? 'crit' : ''}>{fmtPct(link.loss)}</dd></div>
        <div><dt>Latency</dt><dd>{fmtMs(link.latencyMs)}</dd></div>
        <div><dt>Uncorr FEC</dt><dd className={link.crcRate ? 'crit' : ''}>{link.crcRate}/s</dd></div>
        <div><dt>Input errors</dt><dd>{link.crcTotal.toLocaleString()}</dd></div>
        <div><dt>Rx power</dt><dd className={link.rxDbm < -8 ? 'crit' : ''}>{link.rxDbm.toFixed(1)} dBm</dd></div>
        <div><dt>Tx power</dt><dd>{link.txDbm.toFixed(1)} dBm</dd></div>
        <div><dt>Flaps</dt><dd>{link.flaps}</dd></div>
      </dl>
      {link.fault && link.health === 'crit' && (
        <p className="callout">
          Receive light is past the -8.0 dBm alarm and uncorrectable FEC is climbing. The sibling uplink on et-0/48 is clean. Drain this member, then replace the transceiver or the fiber.
        </p>
      )}
      {link.fault && link.health === 'admin' && (
        <p className="callout">This member is drained and carrying no traffic. Check Rx before you undrain it.</p>
      )}
    </>
  )
}

function DeviceDetail({ device, snap }) {
  const links = snap.links.filter((l) => l.a === device.id || l.b === device.id)
  return (
    <>
      <header className="panel-h">
        <h2>{device.role}</h2>
        <span>{device.model}</span>
      </header>
      <h3 className="detail-title"><Lamp health={device.health} /> {device.name}</h3>
      <p className="dim">Rack {device.rack} · {device.mgmt} · AS{device.asn}</p>
      <dl className="facts">
        <div><dt>SDN</dt><dd>{device.bgp}</dd></div>
        <div><dt>CPU</dt><dd>{device.cpu.toFixed(0)}%</dd></div>
        <div><dt>Memory</dt><dd>{device.mem.toFixed(0)}%</dd></div>
        <div><dt>Uptime</dt><dd>{device.uptime}</dd></div>
      </dl>
      <h4>Uplinks</h4>
      <ul className="mini-links">
        {links.map((l) => {
          const other = l.a === device.id ? l.b : l.a
          const otherIf = l.a === device.id ? l.bIf : l.aIf
          const localIf = l.a === device.id ? l.aIf : l.bIf
          return (
            <li key={l.id}>
              <Lamp health={l.health} />
              <span>{localIf} → {nameOf(snap, other)} {otherIf}</span>
              <em>{l.util.toFixed(0)}%</em>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function HostDetail({ host, snap }) {
  const leaf = snap.devices.find((d) => d.id === host.leaf)
  return (
    <>
      <header className="panel-h">
        <h2>Host probe</h2>
        <span>{host.role}</span>
      </header>
      <h3 className="detail-title"><Lamp health={host.health} /> {host.name}</h3>
      <p className="dim">{host.ip} · rack {host.rack} · {leaf.name}</p>
      <dl className="facts">
        <div><dt>Loss</dt><dd className={host.loss > 0.2 ? 'crit' : ''}>{fmtPct(host.loss)}</dd></div>
        <div><dt>Latency</dt><dd>{fmtMs(host.latencyMs)}</dd></div>
      </dl>
      <p className="callout">
        {host.health === 'crit'
          ? 'This host only fails some flows. Compare the two uplinks on its ToR before you touch the server.'
          : 'Probe is clean. If the complaint is about C14, this host is outside the blast radius.'}
      </p>
    </>
  )
}

function centerX(id) {
  if (id.startsWith('spine')) return SPINE_X[id] + NODE_W / 2
  return LEAF_X[id] + NODE_W / 2
}

function nameOf(snap, id) {
  return snap.devices.find((d) => d.id === id)?.name ?? id
}

function resolve(snap, sel) {
  if (sel.kind === 'link') {
    const item = snap.links.find((l) => l.id === sel.id)
    return item ? { kind: 'link', item } : null
  }
  if (sel.kind === 'device') {
    const item = snap.devices.find((d) => d.id === sel.id)
    return item ? { kind: 'device', item } : null
  }
  const item = snap.hosts.find((h) => h.id === sel.id)
  return item ? { kind: 'host', item } : null
}
