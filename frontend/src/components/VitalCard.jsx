import { Droplet, HeartPulse, Wind } from 'lucide-react'
import { PARAM_META, SEVERITY, formatTime, timeAgo } from '../utils/format'
import { SeverityBadge } from './ui'

const ICONS = { glucose: Droplet, heart_rate: HeartPulse, spo2: Wind }

export default function VitalCard({ param, reading }) {
  const meta = PARAM_META[param]
  const Icon = ICONS[param]
  const value = reading?.[param]
  const sev = reading?.[`${param}_severity`]
  const s = SEVERITY[sev] || null
  return (
    <div className={`card relative overflow-hidden p-4 sm:p-5 ${sev === 'red' ? 'ring-2 ring-sev-red/70' : sev && sev !== 'normal' ? `ring-1 ${s.ring}` : ''}`} data-testid={`vital-${param}`}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: s ? s.color : '#334155' }} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <Icon className="h-4 w-4" style={{ color: meta.color }} /> {meta.label}
        </div>
        <SeverityBadge severity={sev} testid={`vital-${param}-severity`} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums" data-testid={`vital-${param}-value`}>{value ?? '—'}</span>
        <span className="text-sm text-muted">{meta.unit}</span>
      </div>
      <div className="mt-2 text-xs text-muted">
        {reading ? <>Updated {formatTime(reading.recorded_at)} · {timeAgo(reading.recorded_at)}</> : 'No readings yet'}
      </div>
    </div>
  )
}
