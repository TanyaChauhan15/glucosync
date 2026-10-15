import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, BellRing, Search, TriangleAlert, Users } from 'lucide-react'
import Layout from '../components/Layout'
import QueueCard from '../components/QueueCard'
import { EmptyState, PageHeader, SeverityBadge, Spinner, StatCard } from '../components/ui'
import api, { errorMessage } from '../services/api'
import { useRealtime } from '../context/RealtimeContext'
import useAcknowledge from '../hooks/useAcknowledge'
import { formatShort } from '../utils/format'

export default function NurseDashboard() {
  const [stats, setStats] = useState(null)
  const [queue, setQueue] = useState(null)
  const [patients, setPatients] = useState([])
  const [q, setQ] = useState('')
  const [sevFilter, setSevFilter] = useState('')
  const [showAcknowledged, setShowAcknowledged] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, qu, p] = await Promise.all([api.get('/dashboard/stats'), api.get('/alerts/pending-by-patient'), api.get('/patients')])
      setStats(s.data)
      setQueue(qu.data.items)
      setPatients(p.data.items)
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])
  useEffect(() => { load() }, [load])
  useRealtime(['queue.updated', 'patient.acknowledged', 'simulation.status', 'reconnected'], load)
  useRealtime('reading.new', (d) => {
    setQueue((list) => list && list.map((e) => (e.patient_id === d.patient_id ? { ...e, latest_reading: d.reading } : e)))
    setPatients((list) => list.map((p) => (p.patient_id === d.patient_id ? { ...p, latest_reading: d.reading } : p)))
  })
  const acknowledge = useAcknowledge(load)

  const filtered = useMemo(() => (queue || []).filter((e) => {
    if (q && !`${e.patient_name} ${e.patient_id}`.toLowerCase().includes(q.toLowerCase())) return false
    if (sevFilter && e.highest_pending_severity !== sevFilter) return false
    if (!showAcknowledged && e.pending_count === 0) return false
    return true
  }), [queue, q, sevFilter, showAcknowledged])

  return (
    <Layout>
      <PageHeader title="Nurse Dashboard" subtitle="Shared hospital alert queue. Every on-duty nurse sees and can act on every patient." />
      {error && <div className="mb-3 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard testid="stat-total" label="Registered patients" value={stats?.total_patients} icon={Users} />
        <StatCard testid="stat-monitored" label="Being monitored" value={stats?.monitored_patients} icon={Activity} accent="#2DD4BF" />
        <StatCard testid="stat-pending-patients" label="Patients with pending alerts" value={stats?.patients_with_pending_alerts} icon={BellRing} accent="#A78BFA" />
        <StatCard testid="stat-red" label="Red alerts pending" value={stats?.pending_red} icon={AlertOctagon} accent="#EF4444" />
        <StatCard testid="stat-orange" label="Orange alerts pending" value={stats?.pending_orange} icon={AlertTriangle} accent="#F97316" />
        <StatCard testid="stat-yellow" label="Yellow alerts pending" value={stats?.pending_yellow} icon={TriangleAlert} accent="#FACC15" />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Patient Alert Queue</h2>
            <p className="text-xs text-muted">Grouped by patient. "Acknowledge Patient" acknowledges all of that patient's currently pending alerts at once.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input className="input w-56 pl-9" placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} data-testid="queue-search" aria-label="Search patients" />
            </div>
            <select className="input w-44" value={sevFilter} onChange={(e) => setSevFilter(e.target.value)} data-testid="queue-severity" aria-label="Filter by severity">
              <option value="">All severities</option><option value="red">Red pending</option><option value="orange">Orange pending</option><option value="yellow">Yellow pending</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" className="accent-teal-400" checked={showAcknowledged} onChange={(e) => setShowAcknowledged(e.target.checked)} data-testid="queue-show-ack" /> Show acknowledged
            </label>
          </div>
        </div>
        {!queue ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title="No patients in the queue" message={queue.length ? 'No patients match your filters.' : 'No alerts yet. New abnormal readings will appear here instantly.'} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="queue">
            {filtered.map((e) => <QueueCard key={e.patient_id} entry={e} onAcknowledge={acknowledge} detailsBase="/nurse/patients" canAcknowledge />)}
          </div>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-semibold">All Patients</h2>
          <Link to="/nurse/alerts" className="text-sm font-semibold text-brand-teal hover:underline">Open alert history</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[640px]" data-testid="all-patients">
            <thead><tr><th className="th">Patient</th><th className="th">Glucose</th><th className="th">HR</th><th className="th">SpO₂</th><th className="th">Latest severity</th><th className="th">Updated</th><th className="th" /></tr></thead>
            <tbody>
              {patients.filter((p) => !q || `${p.full_name} ${p.patient_id}`.toLowerCase().includes(q.toLowerCase())).map((p) => (
                <tr key={p.patient_id} className="border-t border-white/5">
                  <td className="td"><div className="font-medium">{p.full_name}</div><div className="text-xs text-muted">{p.patient_id}{p.monitoring && <span className="ml-1 text-emerald-300">● monitoring</span>}</div></td>
                  <td className="td">{p.latest_reading?.glucose ?? '—'}</td>
                  <td className="td">{p.latest_reading?.heart_rate ?? '—'}</td>
                  <td className="td">{p.latest_reading ? `${p.latest_reading.spo2}%` : '—'}</td>
                  <td className="td"><SeverityBadge severity={p.latest_reading?.overall_severity} /></td>
                  <td className="td text-xs text-muted">{formatShort(p.latest_reading?.recorded_at)}</td>
                  <td className="td"><Link className="text-xs font-semibold text-brand-teal hover:underline" to={`/nurse/patients/${p.patient_id}`}>Details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  )
}
