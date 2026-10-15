import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import VitalCard from '../components/VitalCard'
import ChartsPanel from '../components/ChartsPanel'
import AlertHistoryView from '../components/AlertHistoryView'
import { EmptyState, PageHeader, SeverityBadge, Spinner, StatusBadge } from '../components/ui'
import useReadings from '../hooks/useReadings'
import useAcknowledge from '../hooks/useAcknowledge'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { formatDateTime, formatShort } from '../utils/format'

export default function PatientDetails() {
  const { patientId } = useParams()
  const { user } = useAuth()
  const isNurse = user.user_type === 'nurse'
  const base = isNurse ? '/nurse' : '/doctor'
  const [patient, setPatient] = useState(null)
  const [pending, setPending] = useState(null)
  const [acks, setAcks] = useState([])
  const [error, setError] = useState('')
  const [range, setRange] = useState(360)
  const [acking, setAcking] = useState(false)
  const { readings, latest, loading, error: rError } = useReadings(patientId, range)
  const [lastReading, setLastReading] = useState(null)

  const load = useCallback(async () => {
    try {
      const [p, pend, a, lr] = await Promise.all([
        api.get(`/patients/${patientId}`),
        api.get(`/patients/${patientId}/alerts`, { params: { status: 'pending', page_size: 100 } }),
        api.get(`/patients/${patientId}/acknowledgements`),
        api.get(`/patients/${patientId}/latest-reading`),
      ])
      setPatient(p.data)
      setPending(pend.data)
      setAcks(a.data.items)
      setLastReading(lr.data.reading)
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [patientId])
  useEffect(() => { load() }, [load])
  useRealtime(['alert.new', 'patient.acknowledged', 'simulation.status', 'reconnected'], (d) => { if (!d?.patient_id || d.patient_id === patientId) load() })
  useRealtime('reading.new', (d) => { if (d.patient_id === patientId) setLastReading(d.reading) })
  const acknowledge = useAcknowledge(load)

  if (error) return <Layout><EmptyState title="Could not load patient" message={error}><Link to={`${base}/dashboard`} className="btn-ghost">Back</Link></EmptyState></Layout>
  if (!patient) return <Layout><Spinner /></Layout>
  const current = lastReading && latest && new Date(latest.recorded_at) > new Date(lastReading.recorded_at) ? latest : lastReading || latest
  const pendingCount = pending?.total || 0
  const highest = pending?.items.reduce((h, a) => (['yellow', 'orange', 'red'].indexOf(a.overall_severity) > ['yellow', 'orange', 'red'].indexOf(h) ? a.overall_severity : h), 'yellow')

  return (
    <Layout>
      <PageHeader title={patient.full_name} subtitle={`Patient ID ${patient.patient_id} · ${patient.monitoring ? 'Simulation running' : 'Simulation stopped'} · Last update ${formatDateTime(current?.recorded_at)}`}>
        <Link to={`${base}/dashboard`} className="btn-ghost" data-testid="back-to-dashboard"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>
      </PageHeader>

      <div className="card mb-4 grid gap-4 p-4 text-sm sm:grid-cols-4" data-testid="patient-info">
        <div><div className="label">Email</div>{patient.email}</div>
        <div><div className="label">Contact</div>{patient.contact_number}</div>
        <div><div className="label">HIS consent</div>{patient.his_consent_status} ({formatShort(patient.his_consent_changed_at)})</div>
        <div><div className="label">Registered</div>{formatShort(patient.created_at)}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <VitalCard param="glucose" reading={current} />
        <VitalCard param="heart_rate" reading={current} />
        <VitalCard param="spo2" reading={current} />
      </div>

      <section className={`card mt-4 p-4 ${pendingCount ? 'ring-1 ring-red-500/40' : ''}`} data-testid="pending-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Current pending alerts: <span data-testid="details-pending-count">{pendingCount}</span></h2>
            {pendingCount > 0 && <div className="mt-1 flex items-center gap-2 text-sm text-muted">Highest pending severity <SeverityBadge severity={highest} /></div>}
          </div>
          {isNurse && (
            <button className="btn-teal" disabled={!pendingCount || acking} data-testid="acknowledge-patient"
              onClick={async () => { setAcking(true); await acknowledge({ patient_id: patientId }); setAcking(false) }}>
              {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {pendingCount ? 'Acknowledge Patient' : 'Nothing pending'}
            </button>
          )}
        </div>
        {pendingCount > 0 && (
          <ul className="mt-3 divide-y divide-white/5 text-sm">
            {pending.items.map((a) => (
              <li key={a.alert_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2"><SeverityBadge severity={a.overall_severity} /> {a.alert_code} · {formatShort(a.created_at)}</span>
                <span className="text-muted">G {a.glucose} · HR {a.heart_rate} · SpO₂ {a.spo2}% · {a.triggered_by}</span>
                <StatusBadge status={a.alert_status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ChartsPanel readings={readings} loading={loading} error={rError} range={range} onRangeChange={setRange} />

      <section className="card mt-5 overflow-hidden" data-testid="ack-history">
        <div className="px-4 pt-4 font-semibold">Nurse acknowledgement history</div>
        {acks.length === 0 ? <p className="p-4 text-sm text-muted">No acknowledgements yet.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[560px]">
              <thead><tr><th className="th">Batch</th><th className="th">Acknowledged at</th><th className="th">Nurse</th><th className="th">Alerts</th><th className="th">Highest severity</th></tr></thead>
              <tbody>
                {acks.map((b) => (
                  <tr key={b.batch_id} className="border-t border-white/5" data-testid="ack-row">
                    <td className="td font-mono text-xs">{b.batch_code}</td>
                    <td className="td">{formatDateTime(b.acknowledged_at)}</td>
                    <td className="td">{b.nurse_name} ({b.nurse_id})</td>
                    <td className="td">{b.alert_count}</td>
                    <td className="td"><SeverityBadge severity={b.highest_severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-5">
        <h2 className="mb-3 text-lg font-semibold">Alert history</h2>
        <AlertHistoryView scope="patient" patientId={patientId} compact />
      </section>
    </Layout>
  )
}
