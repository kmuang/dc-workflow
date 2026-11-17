import { fmtTime } from './sim.js'

export function fabricLogs(snap, extras = {}) {
  const now = snap.now
  const { audit = [], psuAt = 0, fanAt = 0 } = extras
  const rows = []

  const push = (ts, device, severity, facility, message) => {
    if (!Number.isFinite(ts)) return
    rows.push({
      id: `${device}|${ts}|${facility}|${message}`,
      ts,
      time: fmtTime(ts),
      device,
      severity,
      facility,
      message,
      source: 'syslog',
    })
  }

  push(now - 26 * 3600e3, 'SPINE-S1', 'notice', 'sdn', 'Spine stage programmed, 4 ToR uplinks')
  push(now - 26 * 3600e3, 'TOR-C14', 'notice', 'sdn', 'ToR forwarding entries programmed, both uplinks')
  push(now - 18 * 3600e3, 'TOR-B07', 'info', 'lldp', 'LLDP neighbor SPINE-S1 et-0/2 refreshed')
  push(now - 8 * 3600e3, 'TOR-A12', 'info', 'interactive', 'mgd: user netops logged in from 10.0.0.5')
  push(now - 6 * 3600e3, 'TOR-C14', 'info', 'interactive', 'No configuration commit in this window')
  push(now - 50 * 60e3, 'TOR-D03', 'critical', 'chassis', 'PSU-B failed, output 0 W, chassis on a single supply')
  push(now - 35 * 60e3, 'SPINE-S2', 'warning', 'chassis', 'FAN-3 speed 2200 rpm, below 6000 rpm threshold')

  const opened = now - 15 * 60e3
  push(opened, 'TOR-C14', 'error', 'optics', 'et-0/49 rx power below low alarm threshold -8.0 dBm')

  const crcStop = snap.flags.opticOk
    ? snap.flags.repairedAt || now
    : snap.flags.drained
      ? snap.flags.drainedAt || now
      : now
  const step = 30e3
  for (let ts = opened + step; ts <= crcStop; ts += step) {
    const rate = Math.round(32 + Math.sin(ts / 1000) * 9)
    push(ts, 'TOR-C14', 'error', 'interface', `et-0/49 input CRC errors, rate ${rate}/s`)
  }

  if (snap.flags.drained && snap.flags.drainedAt) {
    push(snap.flags.drainedAt, 'TOR-C14', 'warning', 'interface', 'et-0/49 administratively down by operator')
  }
  if (snap.flags.opticOk && snap.flags.repairedAt) {
    push(snap.flags.repairedAt, 'TOR-C14', 'notice', 'optics', 'et-0/49 rx power alarm cleared, CRC rate 0/s')
  }
  if (snap.flags.psuOk && psuAt) {
    push(psuAt, 'TOR-D03', 'notice', 'chassis', 'PSU-B output restored, feeds A+B')
  }
  if (snap.flags.fanOk && fanAt) {
    push(fanAt, 'SPINE-S2', 'notice', 'chassis', 'FAN-3 speed restored')
  }
  if (!snap.flags.drained && !snap.flags.opticOk) {
    push(now - 4 * 60e3, 'TOR-C14', 'warning', 'probe', 'Rack C14 probe loss above 0.5 percent')
  }
  if (snap.flags.drained || snap.flags.opticOk) {
    const mark = Math.max(snap.flags.drainedAt || 0, snap.flags.repairedAt || 0)
    if (mark) push(mark + 1000, 'TOR-C14', 'notice', 'probe', 'Rack C14 probe loss cleared')
  }

  for (const entry of audit) {
    if (!entry?.ts) continue
    rows.push({
      id: `audit|${entry.ts}|${entry.text}`,
      ts: entry.ts,
      time: entry.time || fmtTime(entry.ts),
      device: 'jump-host',
      severity: auditSeverity(entry.level),
      facility: 'audit',
      message: entry.text,
      source: 'audit',
    })
  }

  rows.sort((a, b) => a.ts - b.ts)
  return rows
}

function auditSeverity(level) {
  if (level === 'crit') return 'critical'
  if (level === 'warn') return 'warning'
  if (level === 'ok') return 'notice'
  return 'info'
}

export const LOG_SEVERITIES = ['critical', 'error', 'warning', 'notice', 'info']
