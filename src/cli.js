import { diagnose, repairPlan, tracePath } from './sim.js'
import { fabricLogs } from './logs.js'

const HELP = [
  'DCA1 lab. Practice modeled on public Google datacenter practice: Jupiter Clos, mesh probers, drain before repair.',
  'This is not Google\'s internal tool. The order of operations is.',
  '',
  '1. Mesh probers, not the switch',
  '  probers',
  '  ping <host> [source <host>]',
  '',
  '2. Confirm the controller is not the outage',
  '  sdn',
  '  show commits',
  '',
  '3. Localize the drop to one uplink',
  '  path <src> <dst>',
  '  counters [device] [et-0/N]',
  '  optics <device> <et-0/N>',
  '  show log [device|severity error]',
  '',
  '4. Drain, then repair, then undrain',
  '  drain <device> <et-0/N>',
  '  request spare checkout qsfp-100g-lr4',
  '  request spare pickup qsfp-100g-lr4|psu-650w|fan-2ru',
  '  request chassis optic replace <device> <et-0/N>',
  '  request rediag [device]',
  '  undrain <device> <et-0/N>',
  '  request interface monitor <device> <et-0/N>',
  '',
  'Also',
  '  show chassis environment [device]',
  '  show spares',
  '  request ticket tasks|finish <id>|probers|end|bag|change|rma|record|notify|close',
  '  reset scenario',
  '  help',
  '  | match TEXT',
  '',
  'Devices: spine-s1 spine-s2 tor-a12 tor-b07 tor-c14 tor-d03',
  'Hosts: app-a12-01..04  app-b07-01..04  pay-c14-01..04  app-d03-01..04',
].join('\n')

export function execute(raw, ctx) {
  const trimmed = raw.trim()
  if (!trimmed) return { lines: [] }
  if (/^(clear|cls)$/i.test(trimmed)) return { clear: true }

  const pieces = trimmed.split('|')
  const argv = pieces[0].trim().split(/\s+/).filter(Boolean)
  let lines = dispatch(argv, ctx)
  for (const piece of pieces.slice(1)) {
    const pipe = piece.trim()
    const match = pipe.match(/^match\s+(.+)$/i)
    if (!match) {
      lines = [`unknown pipe "${pipe}". Only "match <text>" is supported.`]
      break
    }
    const needle = match[1].toLowerCase()
    lines = lines.filter((line) => line.toLowerCase().includes(needle))
    if (!lines.length) lines = ['(no matches)']
  }
  return { lines }
}

export function complete(raw, snap) {
  const endsWithSpace = /\s$/.test(raw)
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  const typing = endsWithSpace ? '' : parts[parts.length - 1] || ''
  const prior = endsWithSpace ? parts : parts.slice(0, -1)
  const candidates = candidatesFor(prior, snap)
  const hits = candidates.filter((item) => item.toLowerCase().startsWith(typing.toLowerCase()))
  if (hits.length === 1) {
    const next = [...prior, hits[0]].join(' ')
    return { line: `${next} `, options: null }
  }
  if (hits.length > 1) return { line: null, options: hits }
  return { line: null, options: null }
}

function candidatesFor(prior, snap) {
  const head = prior.map((part) => part.toLowerCase())
  if (head.length === 0) return ['help', 'probers', 'path', 'sdn', 'counters', 'optics', 'drain', 'undrain', 'show', 'ping', 'request', 'reset', 'clear']
  if (head[0] === 'show' && head.length === 1) {
    return ['alarms', 'probes', 'interfaces', 'optics', 'bgp', 'log', 'commits', 'maintenance', 'chassis', 'spares', 'lldp']
  }
  if (head[0] === 'show' && head[1] === 'bgp' && head.length === 2) return ['summary']
  if (head[0] === 'show' && head[1] === 'chassis' && head.length === 2) return ['environment', 'hardware', 'alarms']
  if (head[0] === 'show' && head[1] === 'lldp' && head.length === 2) return ['neighbors']
  if (head[0] === 'request' && head.length === 1) return ['interface', 'spare', 'chassis', 'rediag', 'ticket']
  if (head[0] === 'request' && head[1] === 'interface' && head.length === 2) return ['disable', 'enable', 'monitor']
  if (head[0] === 'request' && head[1] === 'spare' && head.length === 2) return ['checkout', 'pickup']
  if (head[0] === 'request' && head[1] === 'spare' && ['checkout', 'pickup'].includes(head[2]) && head.length === 3) {
    return head[2] === 'checkout' ? ['qsfp-100g-lr4'] : ['qsfp-100g-lr4', 'psu-650w', 'fan-2ru']
  }
  if (head[0] === 'request' && head[1] === 'chassis' && head.length === 2) return ['optic', 'psu', 'fan']
  if (head[0] === 'request' && head[1] === 'chassis' && head.length === 3) return ['replace']
  if (head[0] === 'request' && head[1] === 'ticket' && head.length === 2) {
    return ['tasks', 'finish', 'probers', 'end', 'bag', 'change', 'rma', 'record', 'notify', 'close']
  }
  if (head[0] === 'request' && head[1] === 'ticket' && head[2] === 'finish' && head.length === 3) {
    return ['pick-optic', 'pick-psu', 'pick-fan', 'drain', 'probers', 'ends', 'spare', 'replace', 'rediag', 'undrain', 'soak', 'bag', 'rma', 'cmdb', 'change', 'notify', 'psu', 'fan', 'signoff']
  }
  if (head[0] === 'reset' && head.length === 1) return ['scenario']
  if (head[0] === 'show' && head[1] === 'log' && head.length === 2) {
    return [...snap.devices.map((device) => device.name.toLowerCase()), 'severity', 'audit']
  }
  if (head[0] === 'show' && head[1] === 'log' && head[2] === 'severity' && head.length === 3) {
    return ['critical', 'error', 'warning', 'notice', 'info']
  }
  if (wantsDevice(head)) return snap.devices.map((device) => device.name.toLowerCase())
  if (wantsHost(head)) return snap.hosts.map((host) => host.name)
  if (wantsInterface(head, snap)) return interfacesFor(prior, snap)
  return []
}

function wantsDevice(head) {
  if (head[0] === 'show' && ['interfaces', 'optics', 'log'].includes(head[1]) && head.length === 2) return true
  if (head[0] === 'show' && head[1] === 'bgp' && head[2] === 'summary' && head.length === 3) return true
  if (head[0] === 'show' && head[1] === 'chassis' && ['environment', 'hardware'].includes(head[2]) && head.length === 3) return true
  if (head[0] === 'show' && head[1] === 'lldp' && head[2] === 'neighbors' && head.length === 3) return true
  if (head[0] === 'request' && head[1] === 'interface' && head.length === 3) return true
  if (head[0] === 'request' && head[1] === 'chassis' && head[3] === 'replace' && head.length === 4) return true
  if (head[0] === 'request' && head[1] === 'rediag' && head.length === 2) return true
  if (['drain', 'undrain', 'counters', 'optics'].includes(head[0]) && head.length === 1) return true
  return false
}

function wantsHost(head) {
  if (head[0] === 'ping' && (head.length === 1 || (head[2] === 'source' && head.length === 3))) return true
  if (head[0] === 'traceroute' && head.length < 3) return true
  if (head[0] === 'path' && head.length < 3) return true
  return false
}

function wantsInterface(head) {
  if (head[0] === 'show' && ['interfaces', 'optics'].includes(head[1]) && head.length === 3) return true
  if (head[0] === 'request' && head[1] === 'interface' && head.length === 4) return true
  if (head[0] === 'request' && head[1] === 'chassis' && ['optic', 'psu', 'fan'].includes(head[2]) && head.length === 5) return true
  if (['drain', 'undrain', 'counters', 'optics'].includes(head[0]) && head.length === 2) return true
  return false
}

function interfacesFor(prior, snap) {
  const kind = prior[2]
  if (kind === 'psu') return ['psu-a', 'psu-b']
  if (kind === 'fan') return ['fan-1', 'fan-2', 'fan-3', 'fan-4']
  const device = findDevice(snap, prior[prior.length - 1])
  if (!device) return []
  const names = new Set()
  for (const link of snap.links) {
    if (link.a === device.id) names.add(link.aIf)
    if (link.b === device.id) names.add(link.bIf)
  }
  return [...names]
}

function dispatch(argv, ctx) {
  const [verb, ...rest] = argv
  const word = verb.toLowerCase()
  if (word === 'help' || word === '?') return HELP.split('\n')
  if (word === 'probers') return showProbes(ctx.snap)
  if (word === 'path') return traceroute(rest, ctx)
  if (word === 'sdn') return sdnStatus(ctx.snap)
  if (word === 'counters') return showInterfaces(rest, ctx.snap)
  if (word === 'optics') return showOptics(rest, ctx.snap)
  if (word === 'drain') return requestInterface(['disable', ...rest], ctx)
  if (word === 'undrain') return requestInterface(['enable', ...rest], ctx)
  if (word === 'show') return show(rest, ctx)
  if (word === 'ping') return ping(rest, ctx)
  if (word === 'traceroute') return traceroute(rest, ctx)
  if (word === 'request') return request(rest, ctx)
  if (word === 'reset' && rest[0]?.toLowerCase() === 'scenario') {
    ctx.actions.reset()
    return ['Scenario reset. The ticket is open again and no changes are in place.']
  }
  return [`unknown command "${argv.join(' ')}". Type help.`]
}

function sdnStatus(snap) {
  const lines = ['Cluster dca1 SDN', '  Controller partition: none', '  Programmed switches:']
  for (const device of snap.devices) {
    lines.push(`    ${pad(device.name, 12)} ${device.model}  ${device.bgp}`)
  }
  lines.push('Forwarding entries are present. Do not restart the controller for a single dirty uplink.')
  return lines
}

function show(argv, ctx) {
  const { snap } = ctx
  const what = (argv[0] || '').toLowerCase()
  if (what === 'alarms' || (what === 'chassis' && argv[1]?.toLowerCase() === 'alarms')) return showAlarms(snap)
  if (what === 'probes') return showProbes(snap)
  if (what === 'commits' || what === 'maintenance') return showChange(snap)
  if (what === 'spares') return showSpares(ctx)
  if (what === 'interfaces') return showInterfaces(argv.slice(1), snap)
  if (what === 'optics') return showOptics(argv.slice(1), snap)
  if (what === 'bgp') return showBgp(argv.slice(1), snap)
  if (what === 'log') return showLog(argv.slice(1), ctx)
  if (what === 'lldp') return showLldp(argv.slice(1), snap)
  if (what === 'chassis') return showChassis(argv.slice(1), snap)
  return ['usage: show alarms|probes|interfaces|optics|bgp|log|chassis|commits|spares|lldp']
}

function showAlarms(snap) {
  const rows = []
  for (const link of snap.links) {
    const leaf = deviceName(snap, link.a)
    if (link.rxDbm < -8) rows.push(`${pad(leaf + ' ' + link.aIf, 22)} Major   Optics rx power ${link.rxDbm.toFixed(1)} dBm`)
    if (link.crcRate > 0) rows.push(`${pad(leaf + ' ' + link.aIf, 22)} Major   Uncorrectable FEC ${link.crcRate}/s`)
    if (link.health === 'admin') rows.push(`${pad(leaf + ' ' + link.aIf, 22)} Info    WCMP weight 0`)
  }
  for (const device of snap.devices) {
    for (const psu of device.psus) {
      if (psu.status !== 'ok') rows.push(`${pad(device.name + ' ' + psu.id, 22)} Minor   Power supply failed`)
    }
    for (const fan of device.fans) {
      if (fan.status !== 'ok') rows.push(`${pad(device.name + ' ' + fan.id, 22)} Minor   Fan ${fan.rpm} rpm`)
    }
  }
  if (!rows.length) return ['No alarms.']
  return [`${rows.length} alarm${rows.length === 1 ? '' : 's'}`, ...rows]
}

function showProbes(snap) {
  const lines = [pad('Rack', 8) + pad('ToR', 12) + pad('Loss', 10) + 'RTT']
  for (const rack of snap.racks) {
    lines.push(pad(rack.rack, 8) + pad(rack.leafName, 12) + pad(`${rack.loss.toFixed(1)}%`, 10) + `${rack.latencyMs.toFixed(2)} ms`)
  }
  return lines
}

function showChange() {
  return [
    'Maintenance window: none',
    'Last commit: 2026-11-10 02:14:01 UTC  netops  "peer description tidy"',
    'Commits in the last 6 hours: 0',
    'Approved later: CHG-1902 spine work tomorrow 01:00. Not started.',
  ]
}

function showSpares(ctx) {
  const optic = ctx.actions.work.sparePulled || ctx.actions.work.opticPicked || ctx.actions.work.opticOk ? 4 : 5
  const psu = ctx.actions.work.psuPicked || ctx.actions.work.psuOk ? 1 : 2
  const fan = ctx.actions.work.fanPicked || ctx.actions.work.fanOk ? 3 : 4
  return [
    pad('SKU', 20) + pad('Bin', 8) + 'On hand',
    pad('QSFP-100G-LR4', 20) + pad('S-12', 8) + String(optic),
    pad('PSU-650W', 20) + pad('S-04', 8) + String(psu),
    pad('FAN-2RU', 20) + pad('S-07', 8) + String(fan),
  ]
}

function showInterfaces(argv, snap) {
  if (!argv.length) return interfaceTable(snap.links, snap)
  const device = findDevice(snap, argv[0])
  if (!device) return [`unknown device "${argv[0]}"`]
  if (!argv[1]) return interfaceTable(snap.links.filter((link) => link.a === device.id || link.b === device.id), snap)
  const port = normIf(argv[1])
  const link = linkByPort(snap, device, port)
  if (!link) return [`${device.name} has no interface ${port}`]
  return interfaceDetail(snap, device, port, link)
}

function interfaceTable(links, snap) {
  const lines = [pad('Interface', 24) + pad('Weight', 8) + pad('Link', 8) + pad('Util', 8) + pad('In-errors', 12) + 'FEC/s']
  for (const link of links) {
    const leaf = deviceName(snap, link.a)
    const weight = link.health === 'admin' ? '0' : '1'
    const linkUp = link.health === 'down' ? 'down' : 'up'
    lines.push(
      pad(`${leaf} ${link.aIf}`, 24) +
      pad(weight, 8) +
      pad(linkUp, 8) +
      pad(`${link.util.toFixed(0)}%`, 8) +
      pad(String(link.crcTotal), 12) +
      `${link.fecUncorr ?? link.crcRate}/s`,
    )
  }
  return lines
}

function interfaceDetail(snap, device, port, link) {
  const side = portSide(device, port, link)
  const optics = opticsReading(link, side)
  const admin = link.health === 'admin' ? 'administratively down' : 'up'
  return [
    `Physical interface: ${device.name} ${port}, ${admin}, ${link.speed}Gbps`,
    `  Description: fabric to ${otherEnd(snap, device, link)}`,
    `  Input errors: ${side === 'a' ? link.crcTotal : 0}    CRC/s: ${side === 'a' ? link.crcRate : 0}`,
    `  FEC uncorrectable/s: ${side === 'a' ? link.fecUncorr : 0}`,
    `  Flaps: ${side === 'a' ? link.flaps : 0}`,
    `  Utilization: ${link.util.toFixed(0)}%    Loss: ${link.loss.toFixed(1)}%    RTT: ${link.latencyMs.toFixed(2)} ms`,
    `  Laser output power: ${optics.tx.toFixed(1)} dBm`,
    `  Laser receiver power: ${optics.rx.toFixed(1)} dBm`,
    `  Module temperature: ${optics.temp.toFixed(0)} C`,
  ]
}

function showOptics(argv, snap) {
  if (argv.length < 2) return ['usage: show optics <device> <et-0/N>']
  const device = findDevice(snap, argv[0])
  if (!device) return [`unknown device "${argv[0]}"`]
  const port = normIf(argv[1])
  const link = linkByPort(snap, device, port)
  if (!link) return [`${device.name} has no optic in ${port}`]
  const side = portSide(device, port, link)
  const optics = opticsReading(link, side)
  const low = optics.rx < -8
  return [
    `Physical interface: ${device.name} ${port}`,
    `  Laser bias current          :  ${optics.bias.toFixed(1)} mA`,
    `  Laser output power          :  ${optics.tx.toFixed(2)} dBm`,
    `  Laser receiver power        :  ${optics.rx.toFixed(2)} dBm`,
    `  Module temperature          :  ${optics.temp.toFixed(0)} degrees C`,
    '  Alarm thresholds:',
    '    Laser rx power low alarm  :  -8.00 dBm',
    '    Laser rx power low warn   :  -7.00 dBm',
    `  Receiver power alarm        :  ${low ? 'ON' : 'off'}`,
  ]
}

function showBgp(argv, snap) {
  if ((argv[0] || '').toLowerCase() !== 'summary') return ['usage: show bgp summary [device]']
  const devices = argv[1] ? [findDevice(snap, argv[1])].filter(Boolean) : snap.devices
  if (argv[1] && !devices.length) return [`unknown device "${argv[1]}"`]
  const lines = [pad('Peer', 18) + pad('AS', 8) + pad('State', 16) + 'Flaps']
  for (const device of devices) {
    const peers = snap.links.filter((link) => link.a === device.id || link.b === device.id)
    for (const link of peers) {
      const otherId = link.a === device.id ? link.b : link.a
      const other = snap.devices.find((item) => item.id === otherId)
      lines.push(pad(other.mgmt, 18) + pad(String(other.asn), 8) + pad('Establ', 16) + '0')
    }
    if (!peers.length) lines.push(`${device.name}: no fabric peers`)
  }
  lines.push('', 'SDN programming matches the wired Clos. This is not a controller outage.')
  return lines
}

function showLog(argv, ctx) {
  const rows = fabricLogs(ctx.snap, {
    audit: ctx.actions.log,
    psuAt: ctx.actions.work.psuAt,
    fanAt: ctx.actions.work.fanAt,
  })
  const head = (argv[0] || '').toLowerCase()
  let filtered = rows
  if (!head) {
    filtered = rows
  } else if (head === 'audit') {
    filtered = rows.filter((row) => row.source === 'audit')
  } else if (head === 'severity') {
    const level = (argv[1] || '').toLowerCase()
    if (!level) return ['usage: show log severity critical|error|warning|notice|info']
    filtered = rows.filter((row) => row.severity === level)
    if (!filtered.length) return [`No ${level} messages in the buffer.`]
  } else {
    const device = findDevice(ctx.snap, argv[0])
    if (!device) return ['usage: show log [device|audit|severity <level>]']
    filtered = rows.filter((row) => row.device === device.name)
  }
  const tail = filtered.slice(-30)
  if (!tail.length) return ['Log buffer has nothing for that filter.']
  return [
    `${filtered.length} matching, showing ${tail.length}`,
    ...tail.map((row) => `${row.time}  ${pad(row.device, 12)}${pad(row.severity, 10)}${row.message}`),
  ]
}

function showLldp(argv, snap) {
  if ((argv[0] || '').toLowerCase() !== 'neighbors') return ['usage: show lldp neighbors <device>']
  const device = findDevice(snap, argv[1])
  if (!device) return ['usage: show lldp neighbors <device>']
  const lines = [pad('Local', 12) + pad('Neighbor', 18) + 'Remote']
  for (const link of snap.links.filter((link) => link.a === device.id || link.b === device.id)) {
    const local = link.a === device.id ? link.aIf : link.bIf
    const remoteDev = deviceName(snap, link.a === device.id ? link.b : link.a)
    const remoteIf = link.a === device.id ? link.bIf : link.aIf
    lines.push(pad(local, 12) + pad(remoteDev, 18) + remoteIf)
  }
  return lines
}

function showChassis(argv, snap) {
  const kind = (argv[0] || '').toLowerCase()
  if (!['environment', 'hardware'].includes(kind)) return ['usage: show chassis environment|hardware [device]']
  const devices = argv[1] ? [findDevice(snap, argv[1])].filter(Boolean) : snap.devices
  if (argv[1] && !devices.length) return [`unknown device "${argv[1]}"`]
  const lines = []
  for (const device of devices) {
    lines.push(`${device.name}  ${device.model}  rack ${device.rack}`)
    if (kind === 'hardware') {
      lines.push(`  ${pad('Item', 12)}${pad('Status', 10)}Part`)
      for (const psu of device.psus) lines.push(`  ${pad(psu.id, 12)}${pad(psu.status === 'ok' ? 'OK' : 'Failed', 10)}${psu.watts} W`)
      for (const fan of device.fans) lines.push(`  ${pad(fan.id, 12)}${pad(fan.status === 'ok' ? 'OK' : 'Check', 10)}${fan.rpm} rpm`)
    } else {
      lines.push(`  ${pad('Class', 10)}${pad('Item', 12)}${pad('Status', 10)}Measurement`)
      for (const psu of device.psus) {
        lines.push(`  ${pad('Power', 10)}${pad(psu.id, 12)}${pad(psu.status === 'ok' ? 'OK' : 'Failed', 10)}${psu.watts} W`)
      }
      for (const fan of device.fans) {
        lines.push(`  ${pad('Fans', 10)}${pad(fan.id, 12)}${pad(fan.status === 'ok' ? 'OK' : 'Check', 10)}${fan.rpm} RPM`)
      }
      lines.push(`  ${pad('Temp', 10)}${pad('Intake', 12)}${pad('OK', 10)}${device.inletC.toFixed(1)} C`)
      lines.push(`  ${pad('Temp', 10)}${pad('ASIC', 12)}${pad('OK', 10)}${device.asicC.toFixed(0)} C`)
    }
    lines.push('')
  }
  return lines
}

function ping(argv, ctx) {
  if (!argv.length) return ['usage: ping <host> [source <host>]']
  const dst = findHost(ctx.snap, argv[0])
  if (!dst) return [`unknown host "${argv[0]}"`]
  let src = null
  if (argv[1]) {
    if (argv[1].toLowerCase() !== 'source' || !argv[2]) return ['usage: ping <host> [source <host>]']
    src = findHost(ctx.snap, argv[2])
    if (!src) return [`unknown source "${argv[2]}"`]
  }
  const trace = src ? tracePath(ctx.snap, src.id, dst.id) : null
  const loss = trace ? Math.max(...trace.paths.filter((path) => path.active).map((path) => path.loss), 0) : dst.loss
  const rtt = trace ? trace.paths.find((path) => path.active)?.latencyMs ?? dst.latencyMs : dst.latencyMs
  const lines = [`PING ${dst.name} (${dst.ip}): 56 data bytes`]
  for (let i = 0; i < 5; i += 1) {
    const drop = loss > 0.2 && i === 2
    lines.push(drop
      ? `Request timeout for icmp_seq ${i}`
      : `64 bytes from ${dst.ip}: icmp_seq=${i} ttl=61 time=${(rtt + i * 0.03).toFixed(2)} ms`)
  }
  const received = lines.filter((line) => line.startsWith('64')).length
  lines.push(`--- ${dst.ip} ping statistics ---`)
  lines.push(`5 packets transmitted, ${received} packets received, ${Math.round(((5 - received) / 5) * 100)}% packet loss`)
  if (src) lines.push(`source ${src.name} (${src.ip})`)
  return lines
}

function traceroute(argv, ctx) {
  if (argv.length < 2) return ['usage: traceroute <src> <dst>']
  const src = findHost(ctx.snap, argv[0])
  const dst = findHost(ctx.snap, argv[1])
  if (!src) return [`unknown host "${argv[0]}"`]
  if (!dst) return [`unknown host "${argv[1]}"`]
  const trace = tracePath(ctx.snap, src.id, dst.id)
  if (!trace) return ['source and destination are the same host']
  const lines = [`traceroute from ${src.name} to ${dst.name}`]
  trace.paths.forEach((path, index) => {
    const tag = path.active ? 'hash selected' : path.blocked ? 'member down' : 'alternate'
    lines.push('')
    lines.push(`path ${index + 1}  ${path.label}  ${tag}  rtt ${path.latencyMs.toFixed(2)} ms  loss ${path.loss.toFixed(1)}%`)
    path.hops.filter((hop) => hop.kind === 'link' || hop.kind === 'node').forEach((hop, hopIndex) => {
      if (hop.kind === 'node' && hop.id === src.id) return
      lines.push(`  ${hopIndex}  ${hop.name}    ${hop.detail}`)
    })
  })
  return lines
}

function request(argv, ctx) {
  const kind = (argv[0] || '').toLowerCase()
  if (kind === 'interface') return requestInterface(argv.slice(1), ctx)
  if (kind === 'spare') return requestSpare(argv.slice(1), ctx)
  if (kind === 'chassis') return requestChassis(argv.slice(1), ctx)
  if (kind === 'rediag') return requestRediag(argv.slice(1), ctx)
  if (kind === 'ticket') return requestTicket(argv.slice(1), ctx)
  return ['usage: request interface|spare|chassis|rediag|ticket ...']
}

function requestInterface(argv, ctx) {
  const action = (argv[0] || '').toLowerCase()
  const device = findDevice(ctx.snap, argv[1])
  const port = argv[2] ? normIf(argv[2]) : ''
  if (!['disable', 'enable', 'monitor'].includes(action) || !device || !port) {
    return ['usage: request interface disable|enable|monitor <device> <et-0/N>']
  }
  const link = linkByPort(ctx.snap, device, port)
  if (!link) return [`${device.name} has no interface ${port}`]
  const faultPort = link.fault && ((device.id === link.a && port === link.aIf) || (device.id === link.b && port === link.bIf))
  if (action === 'disable') {
    if (!faultPort) return [`${device.name} ${port} is within error and light thresholds. Disable refused.`]
    if (ctx.snap.flags.drained) return [`${device.name} ${port} is already at weight 0.`]
    ctx.actions.drain()
    return [`${device.name} ${port} WCMP weight set to 0.`, 'Traffic hashed onto this member moves to the sibling uplink.']
  }
  if (action === 'enable') {
    if (!faultPort) return [`${device.name} ${port} is already up.`]
    if (!ctx.snap.flags.drained) return [`${device.name} ${port} is already up.`]
    ctx.actions.undrain()
    return ctx.snap.flags.opticOk
      ? [`${device.name} ${port} restored to weight 1.`, 'Watch mesh probers and uncorrectable FEC. Both should stay flat.']
      : [`${device.name} ${port} restored to weight 1.`, 'Uncorrectable FEC is still climbing. Drain it again before you pull the transceiver.']
  }
  if (!faultPort) return [`Nothing to watch on ${device.name} ${port}. Counters are quiet.`]
  if (!ctx.snap.flags.opticOk || ctx.snap.flags.drained) {
    return ['Put the repaired member back in service before the watch window.']
  }
  const plan = repairPlan(ctx.snap, ctx.actions.work)
  if (plan.soakLeft === 0) return ['Watch window is complete. CRC did not start climbing again.']
  if (plan.soakLeft == null) {
    ctx.actions.startSoak()
    return ['Watch started on TOR-C14 et-0/49. In this lab the window is a few seconds.']
  }
  return [`Watch in progress. ${Math.ceil(plan.soakLeft / 1000)}s left.`]
}

function requestSpare(argv, ctx) {
  const action = (argv[0] || '').toLowerCase()
  const sku = (argv[1] || '').toLowerCase()
  if (action === 'pickup') return [ctx.actions.pickPart(sku)]
  if (action !== 'checkout') return ['usage: request spare checkout|pickup <sku>']
  if (sku !== 'qsfp-100g-lr4') return ['Cage S-12 stocks QSFP-100G-LR4. That SKU is not on the shelf.']
  if (ctx.actions.work.sparePulled || ctx.actions.work.opticOk) return ['An LR4 is already checked out to INC-4418.']
  ctx.actions.checkoutSpare()
  return ['Checked out QSFP-100G-LR4 from cage S-12.', 'Serial FNS4481C02Q. Pick it up before you leave the cage.']
}

function requestChassis(argv, ctx) {
  const part = (argv[0] || '').toLowerCase()
  if ((argv[1] || '').toLowerCase() !== 'replace') return ['usage: request chassis optic|psu|fan replace <device> <item>']
  const device = findDevice(ctx.snap, argv[2])
  const item = argv[3] ? normIf(argv[3]) : ''
  if (!device || !item) return ['usage: request chassis optic|psu|fan replace <device> <item>']
  if (part === 'optic') return replaceOptic(ctx, device, item)
  if (part === 'psu') return replacePsu(ctx, device, item)
  if (part === 'fan') return replaceFan(ctx, device, item)
  return ['usage: request chassis optic|psu|fan replace <device> <item>']
}

function replaceOptic(ctx, device, port) {
  const link = linkByPort(ctx.snap, device, port)
  if (!link) return [`${device.name} has no optic in ${port}`]
  const target = device.id === 'leaf-03' && port === 'et-0/49'
  if (!target) return [`${device.name} ${port} receiver power is within the alarm threshold. Optic left in place.`]
  if (ctx.snap.flags.opticOk) return ['That transceiver was already replaced. Uncorrectable FEC is flat.']
  if (!ctx.snap.flags.drained) return ['That member still has weight. Drain it before you unlatch the transceiver.']
  if (!ctx.actions.work.sparePulled) return ['No QSFP-100G-LR4 is checked out. The cage will not open the bin on a guess.']
  if (!ctx.actions.work.opticPicked) return ['The LR4 is checked out but still in cage S-12. Pick it up before you unlatch the old one.']
  ctx.actions.replaceOptic()
  return [
    'Removed optic FNS2241A91K from TOR-C14 et-0/49.',
    'Installed optic FNS4481C02Q.',
    'Receiver power is back inside the threshold. Run rediag before you enable the port.',
  ]
}

function replacePsu(ctx, device, item) {
  if (ctx.actions.work.psuOk && device.id === 'leaf-04') return ['TOR-D03 is already on A+B feeds.']
  if (!(device.id === 'leaf-04' && item.toLowerCase() === 'psu-b')) {
    return [`${device.name} ${item.toUpperCase()} is producing power. Not replacing a healthy supply.`]
  }
  if (!ctx.actions.work.psuPicked) return ['No PSU-650W is in hand. Pick one up from cage S-04 first.']
  ctx.actions.replacePsu()
  return ['Replaced TOR-D03 PSU-B from cage S-04.', 'Both supplies are up.']
}

function replaceFan(ctx, device, item) {
  if (ctx.actions.work.fanOk && device.id === 'spine-b') return ['SPINE-S2 fans are already in range.']
  if (!(device.id === 'spine-b' && item.toLowerCase() === 'fan-3')) {
    return [`${device.name} ${item.toUpperCase()} rpm is in range. Not replacing it.`]
  }
  if (!ctx.actions.work.fanPicked) return ['No FAN-2RU is in hand. Pick one up from cage S-07 first.']
  ctx.actions.replaceFan()
  return ['Replaced SPINE-S2 FAN-3 from cage S-07.', 'Fan speed is back near 9700 rpm.']
}

function requestRediag(argv, ctx) {
  const checks = diagnose(ctx.snap)
  const device = argv[0] ? findDevice(ctx.snap, argv[0]) : null
  if (argv[0] && !device) return [`unknown device "${argv[0]}"`]
  const shown = device ? checks.filter((check) => check.device === device.name) : checks
  const fail = checks.filter((check) => check.state === 'fail').length
  const warn = checks.filter((check) => check.state === 'warn').length
  ctx.actions.recordRediag({
    at: Date.now(),
    fail,
    warn,
    opticPass: checks.filter((check) => check.fault).every((check) => check.state === 'ok'),
  })
  const lines = [
    pad('Check', 22) + pad('Result', 8) + 'Reading',
    ...shown.map((check) => pad(check.name, 22) + pad(check.state, 8) + check.detail),
    '',
    `Fabric result: ${fail} fail, ${warn} warn.`,
  ]
  return lines
}

function requestTicket(argv, ctx) {
  const step = (argv[0] || '').toLowerCase()
  const work = ctx.actions.work
  if (step === 'tasks' || !step) {
    const plan = repairPlan(ctx.snap, work)
    const rows = [...plan.pick, ...plan.inc, ...plan.hw, ...plan.close]
    return [
      'INC-4418 repair tasks',
      ...rows.map((task) => `${task.done ? 'done' : task.ready ? 'ready' : 'open'}  ${task.id}  ${task.title}`),
    ]
  }
  if (step === 'finish') return [ctx.actions.finishTask((argv[1] || '').toLowerCase())]
  if (step === 'end') return [ctx.actions.confirmEnd()]
  if (step === 'bag') return [ctx.actions.bagOptic()]
  if (step === 'change') return [ctx.actions.noteChange()]
  if (step === 'rma') {
    if (!work.bagged) return ['Bag failed transceiver FNS2241A91K before you open the return.']
    if (work.rma) return ['RMA for FNS2241A91K is already open.']
    ctx.actions.run('rma')
    return ['RMA opened for failed transceiver FNS2241A91K.']
  }
  if (step === 'record') {
    if (work.cmdb) return ['Port record already shows serial FNS4481C02Q.']
    ctx.actions.run('cmdb')
    return ['TOR-C14 et-0/49 port record updated to optic FNS4481C02Q.']
  }
  if (step === 'notify') {
    if (work.notify) return ['The service on-call was already told.']
    ctx.actions.run('notify')
    return ['Told the service on-call that rack C14 probers are the thing to watch.']
  }
  if (step === 'close') {
    const plan = repairPlan(ctx.snap, work)
    const open = [...plan.pick, ...plan.inc, ...plan.hw, ...plan.close].filter((task) => !task.done)
    if (!plan.signedOff || open.length) {
      return ['INC-4418 stays open. Still unfinished:', ...open.map((task) => `  - ${task.title}`)]
    }
    if (work.closed) return ['INC-4418 is already closed.']
    ctx.actions.closeTicket()
    return ['INC-4418 closed.']
  }
  return ['usage: request ticket tasks|finish <id>|probers|end|bag|change|rma|record|notify|close']
}

function opticsReading(link, side) {
  if (side === 'b') {
    return { rx: -1.62, tx: -1.18, temp: 41, bias: 6.1 }
  }
  return { rx: link.rxDbm, tx: link.txDbm, temp: link.opticC, bias: link.rxDbm < -8 ? 7.4 : 6.1 }
}

function portSide(device, port, link) {
  if (link.a === device.id && link.aIf === port) return 'a'
  return 'b'
}

function otherEnd(snap, device, link) {
  const otherId = link.a === device.id ? link.b : link.a
  const otherIf = link.a === device.id ? link.bIf : link.aIf
  return `${deviceName(snap, otherId)} ${otherIf}`
}

function linkByPort(snap, device, port) {
  return snap.links.find((link) =>
    (link.a === device.id && link.aIf === port) || (link.b === device.id && link.bIf === port))
}

function findDevice(snap, token) {
  if (!token) return null
  const name = token.toLowerCase()
  return snap.devices.find((device) => device.id === name || device.name.toLowerCase() === name || device.mgmt === token) || null
}

function findHost(snap, token) {
  if (!token) return null
  const name = token.toLowerCase()
  return snap.hosts.find((host) => host.name === name || host.ip === token) || null
}

function deviceName(snap, id) {
  return snap.devices.find((device) => device.id === id)?.name ?? id
}

function normIf(token) {
  return token.toLowerCase()
}

function pad(value, width) {
  const text = String(value)
  return text.length >= width ? `${text} ` : text + ' '.repeat(width - text.length)
}
