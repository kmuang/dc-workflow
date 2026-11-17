import { useMemo, useState } from 'react'
import { buildMethod, demoPair, fmtMs, fmtPct, tracePath } from './sim.js'
import { Lamp } from './ui.jsx'

export function Troubleshoot({ snap, actions }) {
  const steps = buildMethod(snap)
  const [pair, setPair] = useState(() => demoPair(snap.hosts))
  const [src, dst] = pair
  const trace = useMemo(() => tracePath(snap, src, dst), [snap, src, dst])

  return (
    <div className="stack">
      <section className="method-intro">
        <div>
          <p className="eyebrow">Method</p>
          <h2>Probers, then drain, then the transceiver</h2>
          <p>
            Google datacenter practice starts at the mesh probers, not at the switch. Bound the loss to one ToR.
            Confirm the SDN programming is intact. Localize the drop to one uplink with light level and uncorrectable FEC.
            Drain that member so jobs recover, then replace the transceiver, then undrain and watch the probers.
          </p>
        </div>
      </section>

      <div className="trouble">
        <ol className="steps">
          {steps.map((step, i) => (
            <li key={step.title} className={step.state}>
              <span className="step-n">{i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="stack">
          <section className="panel">
            <header className="panel-h">
              <h2>Path check</h2>
              <span>WCMP hash for one flow</span>
            </header>
            <div className="path-pick">
              <label>
                Source
                <select value={src} onChange={(e) => setPair([e.target.value, dst])}>
                  {snap.hosts.map((h) => (
                    <option key={h.id} value={h.id} disabled={h.id === dst}>
                      {h.name} · {h.rack}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination
                <select value={dst} onChange={(e) => setPair([src, e.target.value])}>
                  {snap.hosts.map((h) => (
                    <option key={h.id} value={h.id} disabled={h.id === src}>
                      {h.name} · {h.rack}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {trace && (
              <>
                <p className="note">{trace.note}</p>
                <div className="paths">
                  {trace.paths.map((p) => (
                    <article key={p.id} className={`path ${p.active ? 'active' : ''} ${p.degraded ? 'degraded' : ''} ${p.blocked ? 'blocked' : ''}`}>
                      <header>
                        <strong>{p.label}</strong>
                        <span>
                          {p.active ? 'this flow' : p.blocked ? 'out of hash' : 'alternate'}
                          {p.loss > 0 ? ` · ${fmtPct(p.loss)} loss` : ''}
                          {' · '}
                          {fmtMs(p.latencyMs)}
                        </span>
                      </header>
                      <ol>
                        {p.hops.map((h) => (
                          <li key={h.id} className={h.kind}>
                            <Lamp health={h.health} />
                            <span>
                              <b>{h.name}</b>
                              <small>{h.detail}</small>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <header className="panel-h">
              <h2>Actions on the dirty member</h2>
              <span>TOR-C14 et-0/49</span>
            </header>
            <div className="actions">
              <button className="btn btn-primary" onClick={actions.drain} disabled={actions.drained}>
                Drain uplink
              </button>
              <button className="btn" onClick={actions.checkoutSpare} disabled={actions.work.sparePulled || actions.opticOk}>
                Check out spare
              </button>
              <button
                className="btn"
                onClick={() => actions.pickPart('qsfp-100g-lr4')}
                disabled={!actions.work.sparePulled || actions.work.opticPicked || actions.opticOk}
              >
                Pick up LR4
              </button>
              <button
                className="btn"
                onClick={actions.replaceOptic}
                disabled={actions.opticOk || !actions.drained || !actions.work.sparePulled || !actions.work.opticPicked}
              >
                Replace optic
              </button>
              <button className="btn" onClick={actions.undrain} disabled={!actions.drained}>
                Return to service
              </button>
              <button className="btn btn-ghost" onClick={actions.reset}>
                Reset scenario
              </button>
            </div>
            <p className="hint">
              {actions.opticOk && !actions.drained
                ? 'Transceiver is in spec and the member is back in the WCMP set. Close-out is on Repair.'
                : actions.drained
                  ? 'Drained. Check a QSFP-100G-LR4 out of cage S-12, pick that serial up, then swap the transceiver. Do not undrain until light and FEC are clean.'
                  : 'A drain sets this member to weight 0. It stops the bleeding. It does not fix the transceiver.'}
            </p>
            {actions.log.length > 0 && (
              <ul className="op-log">
                {actions.log.map((e, i) => (
                  <li key={i} className={e.level}>
                    <time>{e.time}</time> {e.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
