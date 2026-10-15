import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PARAM_META, SEVERITY, formatAxisTime, formatDateTime } from '../utils/format'

const DOMAINS = { glucose: [40, 'auto'], heart_rate: [30, 'auto'], spo2: [80, 100] }

function ChartTooltip({ active, payload, param }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const s = SEVERITY[p.severity]
  return (
    <div className="rounded-xl border border-white/10 bg-navy-900/95 px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white">{p.value} {PARAM_META[param].unit}</div>
      <div className="text-muted">{formatDateTime(p.iso)}</div>
      <div className="mt-1 font-semibold" style={{ color: s.color }}>{s.label}</div>
      {p.source === 'simulated' || p.source === 'seed' ? <div className="text-[10px] text-muted">Simulated reading</div> : null}
    </div>
  )
}

export default function VitalChart({ param, readings, rangeMinutes, normalBand }) {
  const meta = PARAM_META[param]
  const data = readings.map((r) => ({
    t: new Date(r.recorded_at).getTime(),
    iso: r.recorded_at,
    value: r[param],
    severity: r[`${param}_severity`],
    source: r.source_type,
  }))
  const now = Date.now()
  const showNormalDots = data.length <= 80
  const renderDot = (props) => {
    const { cx, cy, payload, index } = props
    if (cx == null || cy == null) return <g key={index} />
    if (payload.severity === 'normal') {
      return showNormalDots ? <circle key={index} cx={cx} cy={cy} r={2.5} fill={meta.color} /> : <g key={index} />
    }
    const c = SEVERITY[payload.severity].color
    return <circle key={index} cx={cx} cy={cy} r={payload.severity === 'red' ? 5.5 : 4.5} fill={c} stroke="#080F1F" strokeWidth={1.5} data-severity={payload.severity} className="abnormal-point" />
  }
  return (
    <div className="card p-4" data-testid={`chart-${param}`} data-points={data.length}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{meta.label} vs Time <span className="text-xs font-normal text-muted">({meta.unit})</span></div>
        <div className="text-xs text-muted" data-testid={`chart-${param}-count`}>{data.length} readings</div>
      </div>
      <div className="h-56 w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No readings in this time range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#ffffff10" strokeDasharray="3 3" />
              {normalBand && <ReferenceArea y1={normalBand[0]} y2={normalBand[1]} fill="#2DD4BF" fillOpacity={0.06} ifOverflow="extendDomain" />}
              <XAxis dataKey="t" type="number" scale="time" domain={[now - rangeMinutes * 60000, now]} tickFormatter={(v) => formatAxisTime(v, rangeMinutes)} stroke="#94A3B8" fontSize={11} tickCount={6} />
              <YAxis domain={DOMAINS[param]} stroke="#94A3B8" fontSize={11} allowDecimals={false} />
              <Tooltip content={<ChartTooltip param={param} />} />
              <Line type="monotone" dataKey="value" stroke={meta.color} strokeWidth={2} dot={renderDot} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
