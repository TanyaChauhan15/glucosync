import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertOctagon, Eye, HeartPulse, Search, Users } from 'lucide-react'
import Layout from '../components/Layout'
import { EmptyState, PageHeader, SeverityBadge, Spinner, StatCard, StatusBadge } from '../components/ui'
import api, { errorMessage } from '../services/api'
import { useRealtime } from '../context/RealtimeContext'
import { SEVERITY, formatShort } from '../utils/format'

export default function DoctorDashboard() {
  const [stats, setStats] = useState(null)
  const [patients, setPatients] = useState(null)
  const [recent, setRecent] = useState([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  const loadPatients = useCallback(async (query) => {
    const r = await api.get('/patients', { params: query ? { q: query } : {} })
    setPatients(r.data.items)
  }, [])
  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api.get('/dashboard/stats'), api.get('/alerts', { params: { page_size: 8 } })])
      setStats(s.data)
      setRecent(a.data.items)
      await loadPatients(q)
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [loadPatients, q])
  useEffect(() => { load() }, [load])
  useRealtime(['queue.updated', 'patient.acknowledged', 'simulation.status', 'reconnected'], load)
  useRealtime('reading.new', (d) => setPatients((list) => list && list.map((p) => (p.patient_id === d.patient_id ? { ...p, latest_reading: d.reading, overall_severity: d.reading.overall_severity } : p))))

  return (
    <Layout>
      <PageHeader title="Doctor Dashboard" subtitle="Hospital overview (read-only). Nurses acknowledge alerts; simulation is controlled by patients." />
      {error && <div className="mb-3 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard testid="stat-total" label="Total patients" value={stats?.total_patients} icon={Users} />
        <StatCard testid="stat-monitored" label="Currently monitored" value={stats?.monitored_patients} icon={Activity} accent="#2DD4BF" />
        <StatCard testid="stat-abnormal" label="Abnormal latest reading" value={stats?.patients_with_abnormal_latest_reading} icon={HeartPulse} accent="#F97316" />
        <StatCard testid="stat-critical" label="Critical patients" value={stats?.critical_patients} icon={AlertOctagon} accent="#EF4444" hint="Pending red alert or red latest reading" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Patients</h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input className="input w-64 pl-9" placeholder="Search name or patient ID" value={q} onChange={(e) => setQ(e.target.value)} data-testid="doctor-search" aria-label="Search patients" />
            </div>
          </div>
          {!patients ? <Spinner /> : patients.length === 0 ? <EmptyState title="No patients found" message="Try a different name or patient ID." /> : (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="doctor-patients">
              {patients.map((p) => {
                const r = p.latest_reading
                const sev = r?.overall_severity
                return (
                  <div key={p.patient_id} className="card p-4" data-testid="doctor-patient-card" data-patient-id={p.patient_id} style={{ borderLeft: `4px solid ${sev ? SEVERITY[sev].color : '#334155'}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold">{p.full_name}</div>
                        <div className="text-xs text-muted">{p.patient_id}{p.monitoring && <span className="ml-1 text-emerald-300">● monitoring</span>}</div>
                      </div>
                      <SeverityBadge severity={sev} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded-lg bg-navy-900/70 py-1.5"><div className="text-[11px] text-muted">Glucose</div><b>{r?.glucose ?? '—'}</b></div>
                      <div className="rounded-lg bg-navy-900/70 py-1.5"><div className="text-[11px] text-muted">HR</div><b>{r?.heart_rate ?? '—'}</b></div>
                      <div className="rounded-lg bg-navy-900/70 py-1.5"><div className="text-[11px] text-muted">SpO₂</div><b>{r ? `${r.spo2}%` : '—'}</b></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted">
                      <span>Updated {formatShort(r?.recorded_at)}</span>
                      {p.pending_count > 0 && <span className="text-red-300">{p.pending_count} pending</span>}
                    </div>
                    <Link to={`/doctor/patients/${p.patient_id}`} className="btn-primary mt-3 w-full" data-testid="doctor-view-details"><Eye className="h-4 w-4" /> View Details</Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        <section className="card h-fit p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent Alerts</h2>
            <Link to="/doctor/alerts" className="text-xs font-semibold text-brand-teal hover:underline">All alerts</Link>
          </div>
          {recent.length === 0 ? <p className="text-sm text-muted">No alerts recorded.</p> : (
            <ul className="divide-y divide-white/5" data-testid="recent-alerts">
              {recent.map((a) => (
                <li key={a.alert_id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/doctor/patients/${a.patient_id}`} className="font-medium hover:underline">{a.patient_name}</Link>
                    <SeverityBadge severity={a.overall_severity} />
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-muted">
                    <span>{formatShort(a.created_at)} · {a.triggered_by}</span>
                    <StatusBadge status={a.alert_status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  )
}
