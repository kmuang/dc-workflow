export function Lamp({ health }) {
  return <i className={`lamp ${health || 'ok'}`} aria-hidden="true" />
}

export function Meter({ value }) {
  const v = Math.max(0, Math.min(100, value || 0))
  const tone = v >= 82 ? 'crit' : v >= 70 ? 'warn' : 'ok'
  return (
    <span className={`meter ${tone}`} title={`${v.toFixed(0)}%`}>
      <span style={{ width: `${v}%` }} />
    </span>
  )
}

export function Spark({ values, tone = 'info' }) {
  if (!values?.length) return null
  const w = 112
  const h = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - 2 - ((v - min) / span) * (h - 4)
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className={`spark ${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.5" />
    </svg>
  )
}

export function healthLabel(health) {
  if (health === 'crit') return 'degraded'
  if (health === 'admin') return 'drained'
  if (health === 'warn') return 'hot'
  if (health === 'ok') return 'up'
  return health
}
