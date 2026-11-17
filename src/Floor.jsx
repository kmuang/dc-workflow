import { spares } from './sim.js'
import { Lamp, Meter } from './ui.jsx'

export function Floor({ snap, actions }) {
  const stock = spares(actions.work)
  const headroom = [...snap.links].sort((a, b) => b.util - a.util)

  return (
    <div className="stack">
      <section className="method-intro">
        <div>
          <p className="eyebrow">DCA1 floor</p>
          <h2>Power, cooling, spares, and headroom</h2>
          <p>
            A Jupiter ticket is not done when the probers go green. The same shift still has to know which feed is carrying the rack, whether a fan is covering for a dead one, which transceiver is on the shelf, and how much of each 100G uplink is left.
          </p>
        </div>
      </section>

      <section className="kpis">
        <article className="kpi">
          <span>Single-feed chassis</span>
          <strong className={snap.devices.some((d) => d.psus.some((p) => p.status !== 'ok')) ? 'crit' : 'ok'}>
            {snap.devices.filter((d) => d.psus.some((p) => p.status !== 'ok')).length}
          </strong>
          <em>A supply down, traffic still up</em>
        </article>
        <article className="kpi">
          <span>Fans out of range</span>
          <strong className={snap.devices.some((d) => d.fans.some((f) => f.status !== 'ok')) ? 'warn' : 'ok'}>
            {snap.devices.reduce((n, d) => n + d.fans.filter((f) => f.status !== 'ok').length, 0)}
          </strong>
          <em>Below the rpm floor</em>
        </article>
        <article className="kpi">
          <span>Warmest inlet</span>
          <strong>{Math.max(...snap.devices.map((d) => d.inletC)).toFixed(1)}°</strong>
          <em>Cold aisle, alarm at 27°C</em>
        </article>
        <article className="kpi">
          <span>Tightest uplink</span>
          <strong>{Math.max(...snap.links.map((l) => l.util)).toFixed(0)}%</strong>
          <em>Of a 100G fabric member</em>
        </article>
      </section>

      <div className="split">
        <section className="panel">
          <header className="panel-h">
            <h2>Rack power</h2>
            <span>A and B feeds</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Chassis</th>
                <th>Rack</th>
                <th>Feeds</th>
                <th className="num">Draw</th>
              </tr>
            </thead>
            <tbody>
              {snap.devices.map((d) => {
                const single = d.psus.some((p) => p.status !== 'ok')
                const watts = d.psus.reduce((sum, p) => sum + p.watts, 0)
                return (
                  <tr key={d.id}>
                    <td><Lamp health={single ? 'crit' : 'ok'} />{d.name}</td>
                    <td>{d.rack}</td>
                    <td className={single ? 'crit' : ''}>{single ? 'A only' : 'A+B'}</td>
                    <td className="num">{watts} W</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <header className="panel-h">
            <h2>Cooling</h2>
            <span>Inlet and ASIC</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Chassis</th>
                <th className="num">Inlet</th>
                <th className="num">ASIC</th>
                <th>Fans</th>
              </tr>
            </thead>
            <tbody>
              {snap.devices.map((d) => {
                const slow = d.fans.filter((f) => f.status !== 'ok')
                return (
                  <tr key={d.id}>
                    <td><Lamp health={slow.length ? 'warn' : 'ok'} />{d.name}</td>
                    <td className="num">{d.inletC.toFixed(1)}°C</td>
                    <td className="num">{d.asicC.toFixed(0)}°C</td>
                    <td className={slow.length ? 'warn' : ''}>{slow.length ? slow.map((f) => f.id).join(' ') + ' slow' : '4/4'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>

      <div className="split">
        <section className="panel">
          <header className="panel-h">
            <h2>Spares cage</h2>
            <span>Row S</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Bin</th>
                <th className="num">On hand</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stock.map((part) => (
                <tr key={part.sku}>
                  <td>
                    {part.sku}
                    <div className="dim">{part.note}</div>
                  </td>
                  <td className="mono">{part.bin}</td>
                  <td className="num">{part.onHand}</td>
                  <td>
                    {part.sku === 'QSFP-100G-LR4' && (
                      <>
                        <button className="btn" disabled={actions.work.sparePulled || actions.work.opticOk} onClick={actions.checkoutSpare}>
                          Check out
                        </button>
                        <button className="btn" disabled={!actions.work.sparePulled || actions.work.opticPicked || actions.work.opticOk} onClick={() => actions.pickPart('qsfp-100g-lr4')}>
                          Pick up
                        </button>
                      </>
                    )}
                    {part.sku === 'PSU-650W' && (
                      <>
                        <button className="btn" disabled={actions.work.psuPicked || actions.work.psuOk} onClick={() => actions.pickPart('psu-650w')}>
                          Pick up
                        </button>
                        <button className="btn" disabled={!actions.work.psuPicked || actions.work.psuOk} onClick={actions.replacePsu}>Install</button>
                      </>
                    )}
                    {part.sku === 'FAN-2RU' && (
                      <>
                        <button className="btn" disabled={actions.work.fanPicked || actions.work.fanOk} onClick={() => actions.pickPart('fan-2ru')}>
                          Pick up
                        </button>
                        <button className="btn" disabled={!actions.work.fanPicked || actions.work.fanOk} onClick={actions.replaceFan}>Install</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <header className="panel-h">
            <h2>Change window</h2>
            <span>Tonight</span>
          </header>
          <ul className="alerts">
            <li className="warn">
              <Lamp health="warn" />
              <div>
                <time>INC-4418</time>
                <p>Open. Partial loss on rack C14. Optic work is the active change. No other fabric change is approved.</p>
              </div>
            </li>
            <li className="info">
              <Lamp health="info" />
              <div>
                <time>CHG-1902</time>
                <p>Tomorrow 01:00. Spine maintenance is not started. Do not mix it with this optic swap.</p>
              </div>
            </li>
            <li className="ok">
              <Lamp health="ok" />
              <div>
                <time>Freeze</time>
                <p>Payments asked for a quiet window after 22:00. Finish C14 before then if the watch is clean.</p>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <section className="panel">
        <header className="panel-h">
          <h2>Uplink headroom</h2>
          <span>Free capacity on each 100G member</span>
        </header>
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Used</th>
              <th className="num">Free</th>
            </tr>
          </thead>
          <tbody>
            {headroom.map((link) => {
              const a = snap.devices.find((d) => d.id === link.a)
              const b = snap.devices.find((d) => d.id === link.b)
              return (
                <tr key={link.id}>
                  <td>{a.name} {link.aIf} <span className="dim">→ {b.name} {link.bIf}</span></td>
                  <td className="util"><Meter value={link.util} /><span className="num">{link.util.toFixed(0)}%</span></td>
                  <td className="num">{(100 - link.util).toFixed(0)} G</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
