import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Eye, Loader2, Siren } from 'lucide-react'
import { SeverityBadge } from './ui'
import { SEVERITY, formatShort, formatTime } from '../utils/format'

function Vital({ label, value, unit, sev }) {
  return (
    <div className="rounded-xl bg-navy-900/70 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: sev && sev !== 'normal' ? SEVERITY[sev].color : undefined }}>
        {value ?? '—'} <span className="text-xs font-normal text-muted">{unit}</span>
      </div>
    </div>
  )
}

// One card per PATIENT with a single "Acknowledge Patient" action for all their pending alerts.
export default function QueueCard({ entry, onAcknowledge, detailsBase, canAcknowledge }) {
  const [busy, setBusy] = useState(false)
  const r = entry.latest_reading
  const pending = entry.pending_count > 0
  const sev = entry.highest_pending_severity
  const ack = entry.last_acknowledgement
  const click = async () => {
    setBusy(true)
    try { await onAcknowledge(entry) } finally { setBusy(false) }
  }
  return (
    <div data-testid="queue-card" data-patient-id={entry.patient_id} data-pending={entry.pending_count}
      className={`card relative overflow-hidden p-4 ${pending ? (sev === 'red' ? 'ring-2 ring-sev-red pulse-red' : `ring-1 ${SEVERITY[sev].ring}`) : 'opacity-90'}`}>
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: pending ? SEVERITY[sev].color : '#22C55E55' }} />
      <div className="flex flex-wrap items-start justify-between gap-2 pl-2">
        <div>
          <div className="font-bold" data-testid="queue-patient-name">{entry.patient_name}</div>
          <div className="text-xs text-muted">Patient ID: {entry.patient_id} {entry.monitoring && <span className="ml-1 text-emerald-300">● monitoring</span>}</div>
        </div>
        {pending ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted">Highest pending</span>
            <SeverityBadge severity={sev} size="lg" testid="queue-highest" />
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300" data-testid="queue-acknowledged"><CheckCircle2 className="h-3.5 w-3.5" /> All acknowledged</span>
        )}
      </div>
      {entry.urgent && <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-1.5 pl-3 text-xs font-semibold text-red-200"><Siren className="h-4 w-4" /> Requires urgent review</div>}
      {entry.escalation && (
        <div className="mt-2 rounded-lg bg-orange-500/15 px-3 py-1.5 text-xs text-orange-200" data-testid="queue-escalation">
          {entry.escalation.severity.toUpperCase()} alert unacknowledged for {entry.escalation.unacknowledged_minutes} min (policy: {entry.escalation.policy_minutes} min). Escalate per hospital procedure.
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 pl-2">
        <Vital label="Latest glucose" value={r?.glucose} unit="mg/dL" sev={r?.glucose_severity} />
        <Vital label="Heart rate" value={r?.heart_rate} unit="BPM" sev={r?.heart_rate_severity} />
        <Vital label="SpO₂" value={r?.spo2} unit="%" sev={r?.spo2_severity} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-2 text-xs text-muted">
        <span>Pending alerts: <b className="text-base text-white" data-testid="queue-pending-count">{entry.pending_count}</b></span>
        {pending && (
          <span className="flex gap-1">
            {['red', 'orange', 'yellow'].filter((s) => entry.pending_by_severity[s]).map((s) => (
              <span key={s} className="rounded px-1.5 py-0.5 font-semibold" style={{ background: `${SEVERITY[s].color}22`, color: SEVERITY[s].color }}>{entry.pending_by_severity[s]} {s}</span>
            ))}
          </span>
        )}
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Last alert: {formatShort(entry.last_alert_at)}</span>
      </div>
      {ack && (
        <div className="mt-2 pl-2 text-xs text-muted" data-testid="queue-last-ack">
          Last acknowledged by <b className="text-white">{ack.nurse_name} ({ack.nurse_id})</b> at {formatTime(ack.acknowledged_at, false)} · {ack.alert_count} alert(s), highest {ack.highest_severity}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2 pl-2">
        {canAcknowledge && (
          <button className={pending ? 'btn-teal' : 'btn-ghost'} disabled={!pending || busy} onClick={click} data-testid="acknowledge-patient">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {pending ? 'Acknowledge Patient' : 'Acknowledged'}
          </button>
        )}
        <Link to={`${detailsBase}/${entry.patient_id}`} className="btn-ghost" data-testid="queue-details"><Eye className="h-4 w-4" /> Patient Details</Link>
      </div>
    </div>
  )
}
