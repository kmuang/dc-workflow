const T0 = Date.UTC(2026, 10, 16, 18, 0, 0)

export const SITE = {
  name: 'DCA1',
  fabric: 'Jupiter Clos',
  asn: 65001,
  openedAt: '18:06',
}

export const DEVICES = [
  { id: 'spine-a', name: 'SPINE-S1', role: 'spine', rack: 'M01', model: 'Jupiter spine', mgmt: '10.0.0.11', asn: 65001 },
  { id: 'spine-b', name: 'SPINE-S2', role: 'spine', rack: 'M02', model: 'Jupiter spine', mgmt: '10.0.0.12', asn: 65001 },
  { id: 'leaf-01', name: 'TOR-A12', role: 'tor', rack: 'A12', model: 'Jupiter ToR', mgmt: '10.0.0.21', asn: 65011 },
  { id: 'leaf-02', name: 'TOR-B07', role: 'tor', rack: 'B07', model: 'Jupiter ToR', mgmt: '10.0.0.22', asn: 65012 },
  { id: 'leaf-03', name: 'TOR-C14', role: 'tor', rack: 'C14', model: 'Jupiter ToR', mgmt: '10.0.0.23', asn: 65013 },
  { id: 'leaf-04', name: 'TOR-D03', role: 'tor', rack: 'D03', model: 'Jupiter ToR', mgmt: '10.0.0.24', asn: 65014 },
]

const LEAVES = [
  { id: 'leaf-01', rack: 'A12', prefix: 'app', octet: 12 },
  { id: 'leaf-02', rack: 'B07', prefix: 'app', octet: 7 },
  { id: 'leaf-03', rack: 'C14', prefix: 'pay', octet: 14 },
  { id: 'leaf-04', rack: 'D03', prefix: 'app', octet: 3 },
]

export const HOST_DEFS = LEAVES.flatMap((leaf) =>
  [1, 2, 3, 4].map((n) => ({
    id: `${leaf.prefix}-${leaf.rack.toLowerCase()}-${String(n).padStart(2, '0')}`,
    name: `${leaf.prefix}-${leaf.rack.toLowerCase()}-${String(n).padStart(2, '0')}`,
    rack: leaf.rack,
    leaf: leaf.id,
    ip: `10.14.${leaf.octet}.${10 + n}`,
    role: leaf.prefix === 'pay' ? 'payments' : 'app',
  })),
)

export const LINK_DEFS = LEAVES.flatMap((leaf, i) => [
  {
    id: `${leaf.id}--spine-a`,
    a: leaf.id,
    b: 'spine-a',
    aIf: 'et-0/48',
    bIf: `et-0/${i + 1}`,
    baseUtil: leaf.id === 'leaf-03' ? 36 : 18 + i * 6,
    phase: i * 1.3,
    fault: false,
    pairShift: leaf.id === 'leaf-03',
  },
  {
    id: `${leaf.id}--spine-b`,
    a: leaf.id,
    b: 'spine-b',
    aIf: 'et-0/49',
    bIf: `et-0/${i + 9}`,
    baseUtil: leaf.id === 'leaf-03' ? 88 : 16 + i * 5,
    phase: i * 1.3 + 2.2,
    fault: leaf.id === 'leaf-03',
    pairShift: false,
  },
])

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function hashPair(a, b) {
  let h = 2166136261
  const s = `${a}>${b}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function sampleLink(def, now, flags) {
  const opticBad = def.fault && !flags.opticOk
  const drained = Boolean(def.fault && flags.drained)
  const t = now / 1000
  let util =
    def.baseUtil +
    Math.sin(t / 8 + def.phase) * 5 +
    Math.sin(t / 3.2 + def.phase * 1.4) * 2.2
  if (drained) util = 0
  else if (flags.drained && def.pairShift) util += 34
  util = clamp(util, 0, 96)

  const loss = opticBad && !drained ? clamp(1.7 + Math.sin(t / 2.5 + def.phase) * 0.85, 0.5, 3.6) : 0
  const latencyMs =
    opticBad && !drained
      ? clamp(7.2 + Math.sin(t / 2.1) * 2.8, 3.5, 14)
      : 0.14 + Math.abs(Math.sin(t / 5 + def.phase)) * 0.14
  const crcRate = opticBad && !drained ? Math.round(32 + Math.sin(t) * 9) : 0
  let countedUntil = now
  if (def.fault && flags.opticOk && flags.repairedAt) countedUntil = Math.min(countedUntil, flags.repairedAt)
  if (def.fault && !flags.opticOk && drained && flags.drainedAt) countedUntil = Math.min(countedUntil, flags.drainedAt)
  const crcTotal = def.fault ? Math.max(120, Math.floor((countedUntil - T0) / 1000) * 6) : 0
  const rxDbm = opticBad ? -11.3 + Math.sin(t / 4) * 0.22 : -1.55 + Math.sin(t / 6 + def.phase) * 0.12
  const txDbm = -1.15 + Math.sin(t / 7 + def.phase) * 0.04
  let health = 'ok'
  if (drained) health = 'admin'
  else if (opticBad) health = 'crit'
  else if (util >= 82) health = 'warn'

  const history = Array.from({ length: 26 }, (_, i) => {
    const past = now - (25 - i) * 4000
    const pt = past / 1000
    let u = def.baseUtil + Math.sin(pt / 8 + def.phase) * 5 + Math.sin(pt / 3.2 + def.phase * 1.4) * 2.2
    if (drained) u = 0
    else if (flags.drained && def.pairShift) u += 34
    return clamp(u, 0, 96)
  })

  return {
    ...def,
    util,
    loss,
    latencyMs,
    crcRate,
    crcTotal,
    rxDbm,
    txDbm,
    flaps: opticBad ? 3 : 0,
    health,
    speed: 100,
    opticC: opticBad ? 67 + Math.sin(t) * 1.4 : 38 + Math.sin(t / 5 + def.phase) * 1.5,
    fecUncorr: opticBad && !drained ? crcRate : 0,
    history,
  }
}

function sampleHost(def, now, flags) {
  const hurt = def.leaf === 'leaf-03' && !flags.opticOk && !flags.drained
  const t = now / 1000
  const phase = hashPair(def.id, 'host') % 628 / 100
  const loss = hurt ? clamp(1.15 + Math.sin(t / 2.4 + phase) * 0.55, 0.4, 2.8) : 0
  const latencyMs = hurt
    ? clamp(16 + Math.sin(t / 2.8 + phase) * 7, 8, 36)
    : 0.32 + (hashPair(def.id, 'lat') % 8) * 0.05 + Math.abs(Math.sin(t / 6 + phase)) * 0.08
  return {
    ...def,
    loss,
    latencyMs,
    health: hurt ? 'crit' : 'ok',
  }
}

function sampleDevice(def, now, flags) {
  const stressed = def.id === 'leaf-03' && !flags.opticOk
  const t = now / 1000
  const phase = hashPair(def.id, 'cpu')
  const mid = def.role === 'spine' ? 24 : stressed ? 46 : 18
  const cpu = clamp(mid + Math.sin(t / 9 + phase) * 6, 6, 78)
  const mem = clamp(38 + (phase % 17) + Math.sin(t / 20) * 2, 20, 80)
  const psuDown = def.id === 'leaf-04' && !flags.psuOk
  const fanSlow = def.id === 'spine-b' && !flags.fanOk
  const baseWatts = def.role === 'spine' ? 290 : 120
  return {
    ...def,
    cpu,
    mem,
    health: 'ok',
    bgp: 'programmed',
    uptime: def.role === 'spine' ? '142d' : '88d',
    inletC: clamp(21.2 + (hashPair(def.id, 'in') % 18) / 10 + Math.sin(t / 40) * 0.3, 19, 25),
    asicC: clamp((def.role === 'spine' ? 52 : 44) + Math.sin(t / 14 + phase) * 1.6, 36, 68),
    psus: [
      { id: 'PSU-A', status: 'ok', watts: psuDown ? baseWatts * 2 : baseWatts },
      { id: 'PSU-B', status: psuDown ? 'fail' : 'ok', watts: psuDown ? 0 : baseWatts },
    ],
    fans: [1, 2, 3, 4].map((n) => {
      const slow = fanSlow && n === 3
      return { id: `FAN-${n}`, rpm: slow ? 2200 : 9400 + n * 90, status: slow ? 'warn' : 'ok' }
    }),
  }
}

export function simulate(now, flags) {
  const safe = {
    drained: Boolean(flags?.drained),
    opticOk: Boolean(flags?.opticOk),
    drainedAt: flags?.drainedAt ?? null,
    repairedAt: flags?.repairedAt ?? null,
    psuOk: Boolean(flags?.psuOk),
    fanOk: Boolean(flags?.fanOk),
  }
  const links = LINK_DEFS.map((d) => sampleLink(d, now, safe))
  const hosts = HOST_DEFS.map((d) => sampleHost(d, now, safe))
  const devices = DEVICES.map((d) => sampleDevice(d, now, safe))
  const fault = links.find((l) => l.fault)
  const racks = LEAVES.map((leaf) => {
    const group = hosts.filter((h) => h.leaf === leaf.id)
    const loss = group.reduce((s, h) => s + h.loss, 0) / group.length
    const latencyMs = group.reduce((s, h) => s + h.latencyMs, 0) / group.length
    return {
      rack: leaf.rack,
      leaf: leaf.id,
      leafName: devices.find((d) => d.id === leaf.id).name,
      hosts: group.length,
      loss,
      latencyMs,
      health: loss > 0.2 ? 'crit' : 'ok',
    }
  })

  const opticBad = !safe.opticOk
  const alerts = []
  if (opticBad && !safe.drained) {
    alerts.push({
      level: 'crit',
      time: '18:08',
      text: `TOR-C14 ${fault.aIf} uncorrectable FEC ${fault.crcRate}/s, Rx ${fault.rxDbm.toFixed(1)} dBm.`,
    })
    alerts.push({
      level: 'warn',
      time: '18:07',
      text: `Mesh probers on rack C14 show ${racks.find((r) => r.rack === 'C14').loss.toFixed(1)}% loss. Other racks are clean.`,
    })
  } else if (opticBad && safe.drained) {
    alerts.push({
      level: 'warn',
      time: 'now',
      text: 'TOR-C14 et-0/49 weight is 0. C14 probers are clean. The transceiver is still below the Rx alarm.',
    })
  } else {
    alerts.push({
      level: 'ok',
      time: 'now',
      text: 'TOR-C14 et-0/49 light is in spec. FEC is flat and C14 probers are clean.',
    })
  }
  alerts.push({
    level: 'info',
    time: '18:02',
    text: 'SDN has the fabric programmed. No config push in the last 6 hours.',
  })

  let incident
  if (opticBad && !safe.drained) {
    incident = {
      level: 'crit',
      title: 'Mesh probers failing in rack C14',
      body: 'Serving jobs behind TOR-C14 lose some RPCs. The SDN programming is intact, so this is not a controller blackhole. One ToR uplink toward SPINE-S2 has weak receive light and uncorrectable FEC. The uplink toward SPINE-S1 is clean, so only the flows hashed onto SPINE-S2 fail. Drain that member before you pull the transceiver.',
    }
  } else if (opticBad && safe.drained) {
    incident = {
      level: 'warn',
      title: 'Bad uplink drained',
      body: 'TOR-C14 et-0/49 is at weight 0 and rack C14 probers are clean. The transceiver is still about -11 dBm. Replace it before you undrain, or the loss returns with the hash.',
    }
  } else if (safe.drained && safe.opticOk) {
    incident = {
      level: 'ok',
      title: 'Transceiver replaced, link still drained',
      body: 'Light on TOR-C14 et-0/49 is nominal and FEC has stopped climbing. Undrain it and watch the mesh probers, not just the counter.',
    }
  } else {
    incident = {
      level: 'ok',
      title: 'Rack C14 probers are clean',
      body: 'The member is repaired and back in the WCMP set. Mesh probers on every rack are quiet. Watch FEC for a few minutes to be sure it stays flat.',
    }
  }

  const c14 = racks.find((r) => r.rack === 'C14')
  const degraded = links.filter((l) => l.health === 'crit' || l.health === 'warn').length
  let score = 100
  if (opticBad && !safe.drained) score -= 24
  else if (opticBad && safe.drained) score -= 8
  else if (safe.drained) score -= 4

  return {
    now,
    flags: safe,
    devices,
    links,
    hosts,
    racks,
    alerts,
    incident,
    fault,
    kpis: {
      deviceUp: devices.length,
      deviceTotal: devices.length,
      hostTotal: hosts.length,
      degraded,
      c14Loss: c14.loss,
      c14Latency: c14.latencyMs,
      score,
    },
  }
}

export function buildMethod(snap) {
  const fault = snap.fault
  const { opticOk, drained } = snap.flags
  const opticBad = !opticOk
  const c14 = snap.racks.find((r) => r.rack === 'C14')

  return [
    {
      title: 'Start from the mesh probers',
      state: 'pass',
      text: opticBad && !drained
        ? `Job-facing loss is rack C14 only (${c14.loss.toFixed(1)}% across ${c14.hosts} hosts). Racks A12, B07, and D03 are clean. In a Jupiter Clos that blast radius is one ToR, not a spine stage and not the cluster.`
        : 'Mesh probers are clean. The earlier blast radius was rack C14 behind TOR-C14.',
    },
    {
      title: 'Rule out a push',
      state: 'pass',
      text: 'No fabric push and no drain already in progress in the last 6 hours. Treat the counters as a fault, not a rollout.',
    },
    {
      title: 'Check the SDN programming',
      state: 'pass',
      text: 'The controller still has TOR-C14 and both spine stages programmed. Restarting the control plane would not fix a single dirty uplink.',
    },
    {
      title: 'Localize with counters and light',
      state: opticBad ? 'fail' : 'pass',
      text: opticBad
        ? `TOR-C14 ${fault.aIf} → SPINE-S2 ${fault.bIf}: Rx ${fault.rxDbm.toFixed(1)} dBm against a -8.0 dBm alarm, uncorrectable FEC ${fault.crcRate}/s, ${fault.crcTotal.toLocaleString()} input errors. The sibling uplink et-0/48 is quiet. That is one bad transceiver or fiber, which is what mesh probes look like when only some hashes fail.`
        : `TOR-C14 et-0/49 Rx is ${fault.rxDbm.toFixed(1)} dBm and uncorrectable FEC is ${fault.crcRate}/s. Historical input errors remain at ${fault.crcTotal.toLocaleString()} and are not climbing.`,
    },
    {
      title: 'Drain the bad member',
      state: opticBad && !drained ? 'fail' : 'pass',
      text: opticBad && !drained
        ? 'TOR-C14 has two uplinks. WCMP is spraying onto both. Set the dirty member to weight 0 so serving traffic moves to SPINE-S1. Do that before you pull fiber. Users recover on the drain, not on the repair.'
        : drained && opticBad
          ? 'Weight is already 0 on the dirty member. C14 probers cleared because the hash no longer lands there. The transceiver is still bad.'
          : 'Both uplinks are in the WCMP set and neither one is accumulating FEC.',
    },
    {
      title: 'Repair, undrain, watch the probers',
      state: opticOk && !drained ? 'pass' : 'watch',
      text: opticOk && !drained
        ? 'The member is back at full weight. Mesh probers stay the source of truth. A flat FEC counter means the repair held.'
        : drained && !opticOk
          ? 'Drain stopped the user impact. Replace the transceiver or fiber on et-0/49, confirm Rx is better than -8 dBm and FEC is zero, then undrain and watch the C14 probers.'
          : drained && opticOk
            ? 'Light is healthy while the uplink is still drained. Undrain and confirm the mesh stays clean.'
            : 'Drain TOR-C14 et-0/49 first. Then replace the transceiver. Do not undrain until light and FEC are clean.',
    },
  ]
}

export function tracePath(snap, srcId, dstId) {
  const src = snap.hosts.find((h) => h.id === srcId)
  const dst = snap.hosts.find((h) => h.id === dstId)
  if (!src || !dst || src.id === dst.id) return null

  const device = (id) => snap.devices.find((d) => d.id === id)
  const linkOf = (a, b) => snap.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))

  const hostNode = (h) => ({ kind: 'node', id: h.id, name: h.name, detail: `${h.ip} · rack ${h.rack}`, health: h.health })
  const devNode = (d) => ({ kind: 'node', id: d.id, name: d.name, detail: `${d.role} · rack ${d.rack} · SDN ${d.bgp}`, health: d.health })
  const accessHop = (host, leaf) => ({
    kind: 'link',
    id: `${host.id}--${leaf.id}`,
    name: `${host.name} ↔ ${leaf.name} et-0/${40 + (hashPair(host.id, 'if') % 8)}`,
    detail: 'access · 25G',
    health: 'ok',
    latencyMs: 0.08,
    loss: 0,
    util: 12,
  })

  if (src.leaf === dst.leaf) {
    const leaf = device(src.leaf)
    const hops = [hostNode(src), accessHop(src, leaf), devNode(leaf), accessHop(dst, leaf), hostNode(dst)]
    return {
      src,
      dst,
      note: 'Both hosts sit on the same ToR. The fabric uplinks are not in this path.',
      paths: [
        {
          id: 'local',
          label: 'Same ToR',
          active: true,
          degraded: false,
          blocked: false,
          latencyMs: hops.filter((h) => h.kind === 'link').reduce((s, h) => s + h.latencyMs, 0),
          loss: 0,
          hops,
        },
      ],
    }
  }

  const spines = ['spine-a', 'spine-b']
  const prefer = hashPair(src.id, dst.id) % 2

  const paths = spines.map((spineId, index) => {
    const spine = device(spineId)
    const srcLeaf = device(src.leaf)
    const dstLeaf = device(dst.leaf)
    const up = linkOf(src.leaf, spineId)
    const down = linkOf(dst.leaf, spineId)
    const fabric = [up, down]
    const blocked = fabric.some((l) => l.health === 'admin')
    const degraded = fabric.some((l) => l.loss > 0.2)
    const hopLink = (l) => ({
      kind: 'link',
      id: l.id,
      name: `${device(l.a).name} ${l.aIf} ↔ ${device(l.b).name} ${l.bIf}`,
      detail: `${l.speed}G · util ${l.util.toFixed(0)}% · FEC ${l.fecUncorr}/s · Rx ${l.rxDbm.toFixed(1)} dBm`,
      health: l.health,
      latencyMs: l.latencyMs,
      loss: l.loss,
      util: l.util,
    })
    const hops = [
      hostNode(src),
      accessHop(src, srcLeaf),
      devNode(srcLeaf),
      hopLink(up),
      devNode(spine),
      hopLink(down),
      devNode(dstLeaf),
      accessHop(dst, dstLeaf),
      hostNode(dst),
    ]
    const latencyMs = hops.filter((h) => h.kind === 'link').reduce((s, h) => s + h.latencyMs, 0)
    const loss = Math.max(...hops.filter((h) => h.kind === 'link').map((h) => h.loss))
    return {
      id: spineId,
      label: `via ${spine.name}`,
      prefer: index === prefer,
      blocked,
      degraded,
      latencyMs,
      loss,
      hops,
    }
  })

  const preferred = paths.find((p) => p.prefer)
  const fallback = paths.find((p) => !p.blocked)
  const activeId = preferred && !preferred.blocked ? preferred.id : fallback?.id
  for (const p of paths) p.active = p.id === activeId

  let note
  if (preferred?.blocked) {
    note = `The 5-tuple hash wants ${preferred.label.replace('via ', '')}, but that uplink is drained. The flow follows the remaining member.`
  } else if (preferred?.degraded) {
    note = `This flow hashes ${preferred.label}. That member is dropping packets. The other member is clean, which is why a second ping can still succeed.`
  } else if (paths.some((p) => p.degraded || p.blocked)) {
    note = `This flow hashes ${preferred.label}, the clean member. A different source port would land on the bad member. Partial loss hides if you only test one flow.`
  } else if (preferred?.hops.some((h) => h.health === 'warn')) {
    note = `This flow hashes ${preferred.label}. That member is the busy one, loss is zero, and uncorrectable FEC is flat.`
  } else {
    note = 'Both WCMP paths are clean for this pair. Latency is ToR-to-spine, under a millisecond.'
  }

  return { src, dst, note, paths }
}

export function demoPair(hosts) {
  const srcs = hosts.filter((h) => h.leaf !== 'leaf-03')
  const dsts = hosts.filter((h) => h.leaf === 'leaf-03')
  for (const s of srcs) {
    for (const d of dsts) {
      if (hashPair(s.id, d.id) % 2 === 1) return [s.id, d.id]
    }
  }
  return [srcs[0].id, dsts[0].id]
}

export function fmtPct(n) {
  return `${n.toFixed(1)}%`
}

export function fmtMs(n) {
  if (n < 1) return `${n.toFixed(2)} ms`
  return `${n.toFixed(1)} ms`
}

export function fmtTime(now) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)
}

export const SOAK_MS = 8000

export function spares(work) {
  const opticUsed = work.sparePulled || work.opticPicked || work.opticOk
  return [
    { sku: 'QSFP-100G-LR4', bin: 'S-12', onHand: opticUsed ? 4 : 5, note: '100G LR4 for ToR uplinks' },
    { sku: 'PSU-650W', bin: 'S-04', onHand: work.psuPicked || work.psuOk ? 1 : 2, note: 'ToR power supply' },
    { sku: 'FAN-2RU', bin: 'S-07', onHand: work.fanPicked || work.fanOk ? 3 : 4, note: 'Spine fan tray' },
  ]
}

export function diagnose(snap) {
  const checks = []
  for (const device of snap.devices) {
    const dead = device.psus.filter((p) => p.status !== 'ok')
    const watts = device.psus.reduce((sum, p) => sum + p.watts, 0)
    checks.push({
      id: `${device.id}-power`,
      device: device.name,
      area: 'power',
      name: `${device.name} power`,
      state: dead.length ? 'fail' : 'ok',
      detail: dead.length
        ? `${dead.map((p) => p.id).join(', ')} has no output. The other supply is carrying ${watts} W alone.`
        : `PSU-A and PSU-B are up, ${watts} W combined.`,
    })
    const slow = device.fans.filter((f) => f.status !== 'ok')
    const warm = device.inletC > 27 || device.asicC > 72
    checks.push({
      id: `${device.id}-cool`,
      device: device.name,
      area: 'cooling',
      name: `${device.name} cooling`,
      state: slow.length || warm ? 'warn' : 'ok',
      detail: slow.length
        ? `${slow.map((f) => `${f.id} at ${f.rpm} rpm`).join(', ')}. Inlet ${device.inletC.toFixed(1)}°C, ASIC ${device.asicC.toFixed(0)}°C.`
        : `Four fans in range. Inlet ${device.inletC.toFixed(1)}°C, ASIC ${device.asicC.toFixed(0)}°C.`,
    })
  }
  for (const link of snap.links) {
    const leaf = snap.devices.find((d) => d.id === link.a)
    const spine = snap.devices.find((d) => d.id === link.b)
    const bad = link.rxDbm < -8 || link.crcRate > 0 || link.fecUncorr > 0
    checks.push({
      id: `${link.id}-optic`,
      device: leaf.name,
      area: 'optic',
      name: `${leaf.name} ${link.aIf}`,
      peer: `${spine.name} ${link.bIf}`,
      fault: Boolean(link.fault),
      state: bad ? 'fail' : 'ok',
      detail: `Rx ${link.rxDbm.toFixed(1)} dBm, Tx ${link.txDbm.toFixed(1)} dBm, optic ${link.opticC.toFixed(0)}°C, CRC ${link.crcRate}/s, FEC uncorr ${link.fecUncorr}/s.`,
    })
  }
  return checks
}

export function repairPlan(snap, work) {
  const { drained, opticOk, repairedAt } = snap.flags
  const spareReady = work.sparePulled || opticOk
  const opticSigned = Boolean(
    opticOk &&
    work.lastRediag?.opticPass &&
    work.lastRediag.at >= (repairedAt || Number.MAX_SAFE_INTEGER),
  )
  const inService = opticOk && !drained
  const soakLeft = work.soakStartedAt ? Math.max(0, SOAK_MS - (snap.now - work.soakStartedAt)) : null
  const soakDone = Boolean(inService && soakLeft === 0)
  const hardwareReady = work.psuOk && work.fanOk
  const signedOff = Boolean(
    hardwareReady &&
    opticOk &&
    work.lastRediag &&
    work.lastRediag.fail === 0 &&
    work.lastRediag.warn === 0 &&
    work.lastRediag.at >= (repairedAt || 0) &&
    work.lastRediag.at >= (work.psuAt || 0) &&
    work.lastRediag.at >= (work.fanAt || 0),
  )

  const inc = [
    {
      id: 'drain',
      title: 'Drain TOR-C14 et-0/49',
      detail: 'Set the dirty member to weight 0 so rack C14 stops losing RPCs.',
      done: drained || opticOk,
      action: 'drain',
      actionLabel: 'Drain uplink',
    },
    {
      id: 'probers',
      title: 'Confirm C14 probers cleared',
      detail: 'Jobs should recover on the drain, before anyone pulls a transceiver. Loss on the other racks was already zero.',
      done: work.impactCleared,
      action: 'probers',
      actionLabel: 'Check probers',
      blocked: !drained && !work.impactCleared ? 'Drain the member first.' : '',
    },
    {
      id: 'ends',
      title: 'Mark the bad end',
      detail: 'TOR-C14 et-0/49 receive light is the alarm. SPINE-S2 et-0/11 on the same fiber is in spec, so the module to pull is the ToR side.',
      done: work.badEnd,
      action: 'ends',
      actionLabel: 'Mark ToR end',
      blocked: !drained && !work.badEnd ? 'Drain first, then compare both ends.' : '',
    },
    {
      id: 'spare',
      title: 'Check a QSFP-100G-LR4 out of cage S-12',
      detail: 'Reserve serial FNS4481C02Q, then pick it up from the cage before you walk to the rack.',
      done: spareReady,
      action: 'spare',
      actionLabel: 'Check out spare',
    },
    {
      id: 'replace',
      title: 'Swap the optic',
      detail: 'Seat the new LR4 in TOR-C14 et-0/49 while the member is still at weight 0. Leave the failed module out of the chassis.',
      done: opticOk,
      action: 'replace',
      actionLabel: 'Replace optic',
      blocked: !drained ? 'Drain the member first.' : !spareReady ? 'Check out a spare first.' : !work.opticPicked && !opticOk ? 'Pick up the LR4 from cage S-12 first.' : '',
    },
    {
      id: 'rediag',
      title: 'Rediag the optic',
      detail: opticOk
        ? 'Run hardware rediag after the swap. Rx has to be better than -8 dBm and uncorrectable FEC has to be zero.'
        : 'Rediag before the swap will still fail the transceiver. Run it again once the new module is in.',
      done: opticSigned,
      action: 'rediag',
      actionLabel: 'Open rediag',
      blocked: !opticOk ? 'Replace the optic first.' : '',
    },
    {
      id: 'undrain',
      title: 'Undrain et-0/49',
      detail: 'Put the member back at full WCMP weight only after light and FEC are clean.',
      done: inService,
      action: 'undrain',
      actionLabel: 'Return to service',
      blocked: !opticOk ? 'The optic is still bad.' : !opticSigned ? 'Rediag has to pass after the swap.' : !drained ? '' : '',
    },
    {
      id: 'soak',
      title: 'Watch probers and FEC',
      detail: soakDone
        ? 'Uncorrectable FEC stayed flat and C14 probers stayed clean through the watch window.'
        : soakLeft != null && inService
          ? `Watching. ${Math.ceil(soakLeft / 1000)}s left in this demo window (five minutes on a real shift).`
          : 'After the member is back at full weight, watch C14 probers and uncorrectable FEC. Both have to stay flat.',
      done: soakDone,
      action: 'soak',
      actionLabel: soakLeft != null && !soakDone ? 'Watching…' : 'Start watch',
      blocked: !inService ? 'Return the member to service first.' : soakLeft != null ? 'Watch in progress.' : '',
    },
    {
      id: 'bag',
      title: 'Bag failed transceiver FNS2241A91K',
      detail: 'Label the module you just pulled and put it in the RMA bin. Do not set it back on the spare shelf.',
      done: work.bagged,
      action: 'bag',
      actionLabel: 'Bag module',
      blocked: !opticOk ? 'Replace the transceiver first.' : '',
    },
    {
      id: 'rma',
      title: 'Open the vendor return',
      detail: 'Serial FNS2241A91K is the failed part. The bagged module is what the vendor gets back.',
      done: work.rma,
      action: 'rma',
      actionLabel: work.rma ? 'Filed' : 'Mark RMA filed',
      blocked: !work.bagged ? 'Bag the failed module first.' : '',
    },
    {
      id: 'cmdb',
      title: 'Update the port record',
      detail: 'New optic serial FNS4481C02Q on TOR-C14 et-0/49.',
      done: work.cmdb,
      action: 'cmdb',
      actionLabel: work.cmdb ? 'Updated' : 'Mark record updated',
    },
    {
      id: 'change',
      title: 'Write the drain on INC-4418',
      detail: 'Note the weight-0 window and the transceiver swap on this incident. CHG-1902 is tomorrow’s spine work. Leave that one alone.',
      done: work.changeNoted,
      action: 'change',
      actionLabel: 'Write change note',
      blocked: !drained && !opticOk ? 'Drain the member before you write the change.' : '',
    },
    {
      id: 'notify',
      title: 'Tell the service owners',
      detail: 'Rack C14 is back. Close the loop with the on-call for the jobs that paged.',
      done: work.notify,
      action: 'notify',
      actionLabel: work.notify ? 'Notified' : 'Mark notified',
    },
  ]

  const pick = [
    {
      id: 'pick-optic',
      title: 'Pick up QSFP-100G-LR4 from cage S-12',
      detail: 'Serial FNS4481C02Q. Check it out first, then take it to TOR-C14. Do not grab a different module off the shelf.',
      done: work.opticPicked || opticOk,
      action: 'pick-optic',
      actionLabel: 'Pick up LR4',
      blocked: !spareReady && !work.opticPicked ? 'Check the LR4 out of cage S-12 first.' : '',
    },
    {
      id: 'pick-psu',
      title: 'Pick up PSU-650W from cage S-04',
      detail: 'For TOR-D03 PSU-B. One spare stays on the shelf.',
      done: work.psuPicked || work.psuOk,
      action: 'pick-psu',
      actionLabel: 'Pick up PSU',
    },
    {
      id: 'pick-fan',
      title: 'Pick up FAN-2RU from cage S-07',
      detail: 'For SPINE-S2 FAN-3. The other three fans are still covering the chassis.',
      done: work.fanPicked || work.fanOk,
      action: 'pick-fan',
      actionLabel: 'Pick up fan',
    },
  ]

  const hw = [
    {
      id: 'psu',
      title: 'Replace TOR-D03 PSU-B',
      detail: 'The chassis is up on PSU-A only. Traffic is fine, redundancy is not. The spare has to be in your hands, not still in cage S-04.',
      done: work.psuOk,
      action: 'psu',
      actionLabel: 'Replace PSU',
      blocked: !work.psuPicked && !work.psuOk ? 'Pick up a PSU-650W from cage S-04 first.' : '',
    },
    {
      id: 'fan',
      title: 'Replace SPINE-S2 FAN-3',
      detail: 'FAN-3 is at 2200 rpm against a ~9k rpm floor. The other three fans are covering it. Install the tray you picked up.',
      done: work.fanOk,
      action: 'fan',
      actionLabel: 'Replace fan',
      blocked: !work.fanPicked && !work.fanOk ? 'Pick up a FAN-2RU from cage S-07 first.' : '',
    },
  ]

  const close = [
    {
      id: 'signoff',
      title: 'Sign off with a clean rediag',
      detail: 'One more pass with zero power, fan, and optic failures. That is the record that the hardware is actually finished.',
      done: signedOff,
      action: 'rediag',
      actionLabel: 'Open rediag',
      blocked: !opticOk || !hardwareReady ? 'Finish the optic, the PSU, and the fan first.' : '',
    },
  ]

  return {
    inc: applyFinish(inc, work.finished),
    pick: applyFinish(pick, work.finished),
    hw: applyFinish(hw, work.finished),
    close: applyFinish(close, work.finished),
    soakLeft,
    opticSigned,
    signedOff,
  }
}

function applyFinish(tasks, finished) {
  return tasks.map((task) => {
    const ready = Boolean(task.done)
    return { ...task, ready, done: ready && Boolean(finished?.[task.id]) }
  })
}
