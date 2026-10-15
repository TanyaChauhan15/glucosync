import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Loader2, Play, Plus, Square, Zap } from 'lucide-react'
import Layout from '../components/Layout'
import VitalCard from '../components/VitalCard'
import ChartsPanel from '../components/ChartsPanel'
import ThresholdInfo from '../components/ThresholdInfo'
import { SeverityBadge, SimulatedTag, StatusBadge } from '../components/ui'
import useReadings from '../hooks/useReadings'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { useToast } from '../context/ToastContext'
import { formatDateTime, formatShort, timeAgo } from '../utils/format'

function SimulationControls({ sim, onChange }) {
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const run = async (key, fn) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast('error', errorMessage(e))
    } finally {
      setBusy('')
    }
  }
  const start = () => run('start', async () => {
    const r = await api.post('/simulation/start')
    onChange(r.data)
    toast('success', r.data.already_running ? 'Simulation is already running.' : `Simulation started: a new reading every ${r.data.interval_seconds} seconds.`)
  })
  const stop = () => run('stop', async () => {
    const r = await api.post('/simulation/stop')
    onChange(r.data)
    toast('success', 'Simulation stopped. All stored readings and alerts are kept.')
  })
  const generate = (scenario) => run(scenario, async () => {
    const r = await api.post('/simulation/generate-reading', { scenario })
    toast(r.data.alert ? r.data.alert.overall_severity : 'success', r.data.message)
  })
  const running = sim?.is_running
  return (
    <div className="card p-4" data-testid="simulation-controls">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-teal" />
          <span className="font-semibold">Sensor Simulation</span>
          <SimulatedTag />
        </div>
        <span data-testid="sim-state" data-running={!!running} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${running ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-muted'}`}>
          {running ? '● Running' : '○ Stopped'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-teal" onClick={start} disabled={!!busy || running} data-testid="sim-start">
          {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start Simulation
        </button>
        <button className="btn-danger" onClick={stop} disabled={!!busy || !running} data-testid="sim-stop">
          {busy === 'stop' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Stop Simulation
        </button>
        <button className="btn-ghost" onClick={() => generate('random')} disabled={!!busy} data-testid="sim-generate">
          {busy === 'random' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Generate One Reading
        </button>
      </div>
      <div className="mt-4 border-t border-white/5 pt-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted"><Zap className="h-3.5 w-3.5" /> Demonstration: generate one simulated reading at a chosen level</div>
        <div className="flex flex-wrap gap-2">
          {[['normal', 'Normal', 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'], ['yellow', 'Yellow', 'bg-yellow-400/15 text-yellow-300 hover:bg-yellow-400/25'], ['orange', 'Orange', 'bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'], ['red', 'Red', 'bg-red-500/15 text-red-300 hover:bg-red-500/25']].map(([k, label, cls]) => (
            <button key={k} className={`btn ${cls}`} onClick={() => generate(k)} disabled={!!busy} data-testid={`demo-${k}`}>
              {busy === k && <Loader2 className="h-4 w-4 animate-spin" />} {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        {sim?.last_generated_at ? `Last simulated reading ${timeAgo(sim.last_generated_at)}. ` : ''}
        Simulation runs on the server for your account only and keeps running if you leave this page.
      </p>
    </div>
  )
}

export default function PatientDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [sim, setSim] = useState(null)
  const [range, setRange] = useState(60)
  const [recent, setRecent] = useState([])
  const { readings, latest, loading, error } = useReadings(user.user_id, range)
  const [lastReading, setLastReading] = useState(null)

  const loadMeta = useCallback(() => {
    api.get('/patients/me').then((r) => setProfile(r.data)).catch(() => {})
    api.get('/simulation/status').then((r) => setSim(r.data)).catch(() => {})
    api.get(`/patients/${user.user_id}/latest-reading`).then((r) => setLastReading(r.data.reading)).catch(() => {})
    api.get(`/patients/${user.user_id}/alerts`, { params: { page_size: 5 } }).then((r) => setRecent(r.data.items)).catch(() => {})
  }, [user.user_id])
  useEffect(() => { loadMeta() }, [loadMeta])
  useRealtime('reconnected', loadMeta)
  useRealtime('simulation.status', (d) => { if (d.patient_id === user.user_id) setSim(d) })
  useRealtime('reading.new', (d) => {
    if (d.patient_id !== user.user_id) return
    setLastReading(d.reading)
    setSim((s) => (s ? { ...s, last_generated_at: d.reading.recorded_at } : s))
  })
  useRealtime(['alert.new', 'patient.acknowledged'], (d) => {
    if (d.patient_id !== user.user_id) return
    api.get(`/patients/${user.user_id}/alerts`, { params: { page_size: 5 } }).then((r) => setRecent(r.data.items)).catch(() => {})
    if (d.batch) toast('info', `A nurse (${d.batch.nurse_id}) acknowledged your ${d.batch.alert_count} pending alert(s).`)
  })

  const current = latest && lastReading && new Date(latest.recorded_at) >= new Date(lastReading.recorded_at) ? latest : lastReading || latest

  return (
    <Layout>
      <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5" data-testid="patient-header">
        <div>
          <div className="label">Patient</div>
          <div className="text-lg font-bold" data-testid="patient-name">{profile?.full_name || user.full_name}</div>
        </div>
        <div>
          <div className="label">Patient ID</div>
          <div className="text-lg font-bold" data-testid="patient-id">{user.user_id}</div>
        </div>
        <div>
          <div className="label">Monitoring status</div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {sim?.is_running ? <span className="text-emerald-300">● Live (simulation running)</span> : <span className="text-muted">○ Idle (simulation stopped)</span>}
          </div>
          {current && current.overall_severity !== 'normal' && <div className="mt-1"><SeverityBadge severity={current.overall_severity} /></div>}
        </div>
        <div>
          <div className="label">Last sensor update</div>
          <div className="text-sm font-semibold" data-testid="last-update">{current ? formatDateTime(current.recorded_at) : 'No readings yet'}</div>
          {current && <div className="text-xs text-muted">{timeAgo(current.recorded_at)}</div>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <VitalCard param="glucose" reading={current} />
        <VitalCard param="heart_rate" reading={current} />
        <VitalCard param="spo2" reading={current} />
      </div>
      <div className="mt-4"><SimulationControls sim={sim} onChange={setSim} /></div>

      <ChartsPanel readings={readings} loading={loading} error={error} range={range} onRangeChange={setRange} />

      <section className="card mt-5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Recent Alerts</h2>
          <Link to="/patient/alerts" className="text-sm font-semibold text-brand-teal hover:underline" data-testid="view-all-alerts">View full history</Link>
        </div>
        {recent.length === 0 ? <p className="text-sm text-muted">No alerts yet.</p> : (
          <ul className="divide-y divide-white/5" data-testid="recent-alerts">
            {recent.map((a) => (
              <li key={a.alert_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-2"><SeverityBadge severity={a.overall_severity} /> {formatShort(a.created_at)}</span>
                <span className="text-muted">G {a.glucose} · HR {a.heart_rate} · SpO₂ {a.spo2}%</span>
                <StatusBadge status={a.alert_status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <ThresholdInfo />
    </Layout>
  )
}
