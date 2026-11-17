import { useEffect, useMemo, useState } from 'react'
import { SITE, simulate, fmtTime, repairPlan } from './sim.js'
import { Overview } from './Overview.jsx'
import { Fabric } from './Fabric.jsx'
import { Devices } from './Devices.jsx'
import { Troubleshoot } from './Troubleshoot.jsx'
import { Terminal } from './Terminal.jsx'
import { Repair } from './Repair.jsx'
import { Rediag } from './Rediag.jsx'
import { Floor } from './Floor.jsx'
import { Logs } from './Logs.jsx'

const NAV = [
  ['overview', 'Overview'],
  ['fabric', 'Fabric'],
  ['devices', 'Devices'],
  ['troubleshoot', 'Troubleshoot'],
  ['terminal', 'Terminal'],
  ['logs', 'Logs'],
  ['repair', 'Repair'],
  ['rediag', 'Rediag'],
  ['floor', 'Floor'],
]

export default function App() {
  const [view, setView] = useState('overview')
  const [now, setNow] = useState(() => Date.now())
  const [drained, setDrained] = useState(false)
  const [opticOk, setOpticOk] = useState(false)
  const [drainedAt, setDrainedAt] = useState(null)
  const [repairedAt, setRepairedAt] = useState(null)
  const [sparePulled, setSparePulled] = useState(false)
  const [opticPicked, setOpticPicked] = useState(false)
  const [psuPicked, setPsuPicked] = useState(false)
  const [fanPicked, setFanPicked] = useState(false)
  const [psuOk, setPsuOk] = useState(false)
  const [fanOk, setFanOk] = useState(false)
  const [psuAt, setPsuAt] = useState(0)
  const [fanAt, setFanAt] = useState(0)
  const [lastRediag, setLastRediag] = useState(null)
  const [soakStartedAt, setSoakStartedAt] = useState(null)
  const [rma, setRma] = useState(false)
  const [cmdb, setCmdb] = useState(false)
  const [notify, setNotify] = useState(false)
  const [impactCleared, setImpactCleared] = useState(false)
  const [badEnd, setBadEnd] = useState(false)
  const [bagged, setBagged] = useState(false)
  const [changeNoted, setChangeNoted] = useState(false)
  const [finished, setFinished] = useState({})
  const [closed, setClosed] = useState(false)
  const [log, setLog] = useState([])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000)
    return () => clearInterval(id)
  }, [])

  const snap = useMemo(
    () => simulate(now, { drained, opticOk, drainedAt, repairedAt, psuOk, fanOk }),
    [now, drained, opticOk, drainedAt, repairedAt, psuOk, fanOk],
  )

  function pushLog(level, text) {
    const ts = Date.now()
    setLog((prev) => [{ level, time: fmtTime(ts), ts, text }, ...prev].slice(0, 40))
  }

  const actions = {
    drained,
    opticOk,
    log,
    drain() {
      if (drained) return
      setDrained(true)
      setDrainedAt(Date.now())
      pushLog('warn', 'Drained TOR-C14 et-0/49. C14 traffic moved to SPINE-S1.')
    },
    undrain() {
      if (!drained) return
      setDrained(false)
      pushLog(
        opticOk ? 'ok' : 'crit',
        opticOk
          ? 'Returned TOR-C14 et-0/49 to the WCMP set.'
          : 'Undrained TOR-C14 et-0/49 before the optic was replaced. C14 loss returned.',
      )
    },
    checkoutSpare() {
      if (sparePulled || opticOk) return
      setSparePulled(true)
      pushLog('ok', 'Checked out QSFP-100G-LR4 from cage S-12. Four left on the shelf.')
    },
    replaceOptic() {
      if (opticOk || !drained || !sparePulled || !opticPicked) return
      setOpticOk(true)
      setRepairedAt(Date.now())
      pushLog('ok', 'Replaced the optic on TOR-C14 et-0/49. Rx is nominal and CRC stopped.')
    },
    replacePsu() {
      if (psuOk || !psuPicked) return
      setPsuOk(true)
      setPsuAt(Date.now())
      pushLog('ok', 'Replaced TOR-D03 PSU-B. The chassis is back on A+B feeds.')
    },
    replaceFan() {
      if (fanOk || !fanPicked) return
      setFanOk(true)
      setFanAt(Date.now())
      pushLog('ok', 'Replaced SPINE-S2 FAN-3. All four fans are in rpm range.')
    },
    pickPart(sku) {
      const key = String(sku || '').toLowerCase()
      if (key === 'qsfp-100g-lr4') {
        if (opticOk || opticPicked) return 'QSFP-100G-LR4 serial FNS4481C02Q is already in hand.'
        if (!sparePulled) return 'Check the LR4 out of cage S-12 before you pick it up.'
        setOpticPicked(true)
        pushLog('ok', 'Picked up QSFP-100G-LR4 FNS4481C02Q from cage S-12 for TOR-C14.')
        return 'Picked up QSFP-100G-LR4 FNS4481C02Q from cage S-12. Take it to TOR-C14.'
      }
      if (key === 'psu-650w') {
        if (psuOk || psuPicked) return 'PSU-650W is already in hand.'
        setPsuPicked(true)
        pushLog('ok', 'Picked up PSU-650W from cage S-04 for TOR-D03.')
        return 'Picked up PSU-650W from cage S-04. One remains on the shelf.'
      }
      if (key === 'fan-2ru') {
        if (fanOk || fanPicked) return 'FAN-2RU is already in hand.'
        setFanPicked(true)
        pushLog('ok', 'Picked up FAN-2RU from cage S-07 for SPINE-S2.')
        return 'Picked up FAN-2RU from cage S-07. Three remain on the shelf.'
      }
      return 'Pick list is QSFP-100G-LR4, PSU-650W, or FAN-2RU.'
    },
    startSoak() {
      if (!opticOk || drained || soakStartedAt) return
      setSoakStartedAt(Date.now())
      pushLog('info', 'Started the watch on TOR-C14 et-0/49. Looking for new FEC and C14 prober loss.')
    },
    confirmProbers() {
      const c14 = snap.racks.find((rack) => rack.rack === 'C14')
      if (!drained) return 'Drain TOR-C14 et-0/49 before you call the probers clean.'
      if (!c14 || c14.loss > 0.2) return 'C14 probers are still failing.'
      if (impactCleared) return 'C14 probers were already marked clean on this drain.'
      setImpactCleared(true)
      pushLog('ok', 'C14 mesh probers are clean while et-0/49 is at weight 0.')
      return 'C14 mesh probers are clean while et-0/49 is at weight 0.'
    },
    confirmEnd() {
      if (!drained && !badEnd) return 'Drain TOR-C14 et-0/49, then compare both ends of the fiber.'
      if (badEnd) return 'TOR-C14 et-0/49 is already marked as the bad end.'
      setBadEnd(true)
      pushLog('ok', 'Bad end is TOR-C14 et-0/49. SPINE-S2 et-0/11 receive light is in spec.')
      return 'Bad end is TOR-C14 et-0/49. Leave the SPINE-S2 transceiver in place.'
    },
    bagOptic() {
      if (!opticOk) return 'The failed transceiver is still in the chassis.'
      if (bagged) return 'FNS2241A91K is already in the RMA bin.'
      setBagged(true)
      pushLog('ok', 'Bagged failed transceiver FNS2241A91K for return.')
      return 'Bagged failed transceiver FNS2241A91K. It is not a spare.'
    },
    noteChange() {
      if (!drained && !opticOk) return 'Drain the member before you write the change on INC-4418.'
      if (changeNoted) return 'INC-4418 already notes this drain and swap.'
      setChangeNoted(true)
      pushLog('info', 'INC-4418 notes the TOR-C14 et-0/49 drain and transceiver swap.')
      return 'INC-4418 notes the weight-0 window and the transceiver swap. CHG-1902 was left alone.'
    },
    finishTask(id) {
      const plan = repairPlan(snap, actions.work)
      const task = [...plan.pick, ...plan.inc, ...plan.hw, ...plan.close].find((item) => item.id === id)
      if (!task) return `No repair task "${id}".`
      if (task.done) return `${task.title} is already confirmed.`
      if (!task.ready) return task.blocked || `${task.title} is not done yet.`
      setFinished((prev) => ({ ...prev, [id]: true }))
      pushLog('ok', `Confirmed: ${task.title}.`)
      return `${task.title} confirmed.`
    },
    recordRediag(result) {
      setLastRediag(result)
      pushLog(result.fail || result.warn ? 'warn' : 'ok', `Rediag finished. ${result.fail} fail, ${result.warn} warn.`)
    },
    closeTicket() {
      setClosed(true)
      pushLog('ok', 'Closed INC-4418.')
    },
    run(action) {
      const fn = {
        drain: actions.drain,
        spare: actions.checkoutSpare,
        'pick-optic': () => actions.pickPart('qsfp-100g-lr4'),
        'pick-psu': () => actions.pickPart('psu-650w'),
        'pick-fan': () => actions.pickPart('fan-2ru'),
        replace: actions.replaceOptic,
        rediag: () => setView('rediag'),
        undrain: actions.undrain,
        soak: actions.startSoak,
        probers: actions.confirmProbers,
        ends: actions.confirmEnd,
        bag: actions.bagOptic,
        change: actions.noteChange,
        rma: () => setRma(true),
        cmdb: () => setCmdb(true),
        notify: () => setNotify(true),
        psu: actions.replacePsu,
        fan: actions.replaceFan,
      }[action]
      fn?.()
    },
    reset() {
      setDrained(false)
      setOpticOk(false)
      setDrainedAt(null)
      setRepairedAt(null)
      setSparePulled(false)
      setOpticPicked(false)
      setPsuPicked(false)
      setFanPicked(false)
      setPsuOk(false)
      setFanOk(false)
      setPsuAt(0)
      setFanAt(0)
      setLastRediag(null)
      setSoakStartedAt(null)
      setRma(false)
      setCmdb(false)
      setNotify(false)
      setImpactCleared(false)
      setBadEnd(false)
      setBagged(false)
      setChangeNoted(false)
      setFinished({})
      setClosed(false)
      setLog([])
    },
  }

  actions.work = {
    sparePulled,
    opticPicked,
    psuPicked,
    fanPicked,
    opticOk,
    psuOk,
    fanOk,
    psuAt,
    fanAt,
    lastRediag,
    soakStartedAt,
    rma,
    cmdb,
    notify,
    impactCleared,
    badEnd,
    bagged,
    changeNoted,
    finished,
    closed,
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-kicker">Fabric monitor</span>
          <strong>{SITE.name}</strong>
          <span className="brand-sub">Jupiter Clos · mesh probers · simulated</span>
        </div>
        <nav className="nav" aria-label="Sections">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              className={view === id ? 'navbtn on' : 'navbtn'}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="side-score">
          <span>Service health</span>
          <strong className={snap.kpis.score >= 95 ? 'ok' : snap.kpis.score >= 85 ? 'warn' : 'crit'}>
            {snap.kpis.score}
          </strong>
          <em>{snap.flags.opticOk ? 'C14 probes clean' : snap.flags.drained ? 'Impact mitigated' : 'C14 partial loss'}</em>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Jupiter-style troubleshooting</p>
            <h1>{NAV.find(([id]) => id === view)[1]}</h1>
          </div>
          <div className="top-meta">
            <span className="live"><i /> live</span>
            <time dateTime={new Date(now).toISOString()}>{fmtTime(now)}</time>
          </div>
        </header>
        <main>
          {view === 'overview' && (
            <Overview snap={snap} onOpen={() => setView('troubleshoot')} onRepair={() => setView('repair')} />
          )}
          {view === 'fabric' && <Fabric snap={snap} />}
          {view === 'devices' && <Devices snap={snap} />}
          {view === 'troubleshoot' && <Troubleshoot snap={snap} actions={actions} />}
          {view === 'terminal' && <Terminal snap={snap} actions={actions} />}
          {view === 'logs' && <Logs snap={snap} actions={actions} />}
          {view === 'repair' && <Repair snap={snap} actions={actions} />}
          {view === 'rediag' && <Rediag snap={snap} actions={actions} />}
          {view === 'floor' && <Floor snap={snap} actions={actions} />}
        </main>
      </div>
    </div>
  )
}
