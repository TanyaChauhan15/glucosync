import { useCallback, useEffect, useState } from 'react'
import { Code2, Network, RefreshCw } from 'lucide-react'
import Layout from '../components/Layout'
import { Modal, PageHeader, Pagination, SeverityBadge, Spinner } from '../components/ui'
import api, { errorMessage } from '../services/api'
import { useRealtime } from '../context/RealtimeContext'
import { formatDateTime, formatShort } from '../utils/format'

const STATUS = {
  success: ['Shared', 'bg-emerald-500/15 text-emerald-300'],
  failed: ['Failed', 'bg-red-500/15 text-red-300'],
  awaiting_data: ['Awaiting data', 'bg-white/5 text-muted'],
  not_shared_no_consent: ['Not shared (no consent)', 'bg-white/5 text-muted'],
}

export default function HISIntegration() {
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState(null)
  const [page, setPage] = useState(1)
  const [records, setRecords] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.get('/his/sync-status'), api.get('/his/sync-history', { params: { page, page_size: 15 } })])
      setStatus(s.data.items)
      setHistory(h.data)
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [page])
  useEffect(() => { load() }, [load])
  useRealtime(['alert.new', 'reconnected'], load)

  const openRecords = async (pid) => {
    try {
      const r = await api.get(`/his/mock-records/${pid}`, { params: { limit: 5 } })
      setRecords({ pid, items: r.data.items })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Layout>
      <PageHeader title="Mock HIS Integration" subtitle="Prototype data-sharing module. Not connected to any real hospital information system.">
        <button className="btn-ghost" onClick={load} data-testid="his-refresh"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </PageHeader>
      <div className="mb-4 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
        <Network className="mr-2 inline h-4 w-4" />Readings and alerts are sent as FHIR-shaped resources (LOINC-coded observations) to a mock endpoint, only for patients whose HIS consent is granted. Alert thresholds are project rules, not SNOMED CT values.
      </div>
      {error && <div className="mb-3 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}
      <div className="card overflow-hidden">
        {!status ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]" data-testid="his-status-table">
              <thead><tr><th className="th">Patient</th><th className="th">Consent</th><th className="th">Last shared reading</th><th className="th">Latest alert</th><th className="th">Sharing status</th><th className="th">Last sync</th><th className="th" /></tr></thead>
              <tbody>
                {status.map((s) => (
                  <tr key={s.patient_id} className="border-t border-white/5" data-testid="his-row">
                    <td className="td"><div className="font-medium">{s.patient_name}</div><div className="text-xs text-muted">{s.patient_id}</div></td>
                    <td className="td capitalize">{s.his_consent_status}</td>
                    <td className="td text-xs">{s.last_shared_reading ? <>G {s.last_shared_reading.glucose} · HR {s.last_shared_reading.heart_rate} · SpO₂ {s.last_shared_reading.spo2}%<div className="text-muted">{formatShort(s.last_shared_reading.recorded_at)}</div></> : '—'}</td>
                    <td className="td"><SeverityBadge severity={s.latest_alert_severity} /></td>
                    <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[s.sharing_status][1]}`}>{STATUS[s.sharing_status][0]}</span>{s.failed_attempts > 0 && <div className="mt-1 text-[11px] text-red-300">{s.failed_attempts} failed attempt(s)</div>}</td>
                    <td className="td text-xs">{formatDateTime(s.last_sync_at)}</td>
                    <td className="td"><button className="text-xs font-semibold text-brand-teal hover:underline" onClick={() => openRecords(s.patient_id)} data-testid="his-view-records"><Code2 className="mr-1 inline h-3.5 w-3.5" />Received data</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="mb-3 mt-6 text-lg font-semibold">Synchronisation log</h2>
      <div className="card overflow-hidden">
        {!history ? <Spinner /> : history.items.length === 0 ? <p className="p-4 text-sm text-muted">No sharing attempts yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]" data-testid="his-history-table">
              <thead><tr><th className="th">Attempted</th><th className="th">Patient</th><th className="th">Data type</th><th className="th">Status</th><th className="th">Completed</th><th className="th">Error</th></tr></thead>
              <tbody>
                {history.items.map((h) => (
                  <tr key={h.sync_id} className="border-t border-white/5">
                    <td className="td text-xs">{formatDateTime(h.attempted_at)}</td>
                    <td className="td">{h.patient_id}</td>
                    <td className="td capitalize">{h.data_type}</td>
                    <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[h.sync_status]?.[1] || ''}`}>{h.sync_status}</span></td>
                    <td className="td text-xs">{formatDateTime(h.completed_at)}</td>
                    <td className="td text-xs text-red-300">{h.error_message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {history && <Pagination page={history.page} pages={Math.max(1, Math.ceil(history.total / history.page_size))} total={history.total} onPage={setPage} />}

      <Modal open={!!records} onClose={() => setRecords(null)} title={`Mock HIS records · ${records?.pid}`} wide>
        {records?.items.length === 0 ? <p className="text-sm text-muted">The mock HIS has not received any data for this patient.</p> : (
          <div className="space-y-3" data-testid="his-records">
            {records?.items.map((r) => (
              <div key={r.record_id}>
                <div className="mb-1 text-xs text-muted">{r.resource_type} · received {formatDateTime(r.received_at)}</div>
                <pre className="max-h-64 overflow-auto rounded-xl bg-navy-950 p-3 text-[11px] text-slate-300">{JSON.stringify(r.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Layout>
  )
}
