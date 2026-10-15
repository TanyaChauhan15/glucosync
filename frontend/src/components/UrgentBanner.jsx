import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Siren } from 'lucide-react'
import api from '../services/api'
import { useRealtime } from '../context/RealtimeContext'

// Red alerts stay visible on every nurse page until the patient is acknowledged.
export default function UrgentBanner() {
  const [urgent, setUrgent] = useState([])
  const load = useCallback(() => {
    api.get('/alerts/pending-by-patient').then((r) => setUrgent(r.data.items.filter((e) => e.urgent))).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  useRealtime(['queue.updated', 'patient.acknowledged', 'reconnected'], load)
  if (urgent.length === 0) return null
  return (
    <div className="border-b border-red-500/40 bg-red-600/20 px-4 py-2.5 sm:px-6" role="alert" data-testid="urgent-banner">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Siren className="h-5 w-5 animate-pulse text-red-300" />
        <span className="font-semibold text-red-100">Urgent review required:</span>
        {urgent.map((e) => (
          <Link key={e.patient_id} to={`/nurse/patients/${e.patient_id}`} className="rounded-full bg-red-500/30 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-red-500/50">
            {e.patient_name} ({e.patient_id}) · {e.pending_count} pending
            {e.escalation ? ` · unacknowledged ${e.escalation.unacknowledged_minutes} min, escalate per policy` : ''}
          </Link>
        ))}
      </div>
    </div>
  )
}
