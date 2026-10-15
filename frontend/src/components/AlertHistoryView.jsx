import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileClock, RotateCcw, Search } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useRealtime } from '../context/RealtimeContext'
import AlertDetailModal from './AlertDetailModal'
import { EmptyState, Pagination, SeverityBadge, Spinner, StatusBadge } from './ui'
import { formatDateTime, formatShort, zonedDayBoundary } from '../utils/format'

const EMPTY = { q: '', severity: '', status: '', from: '', to: '' }

// scope 'patient' -> /patients/{id}/alerts (own or selected patient); 'hospital' -> /alerts (staff, all patients)
export default function AlertHistoryView({ scope, patientId, patientLinkBase, compact = false }) {
  const [filters, setFilters] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    const params = { page, page_size: compact ? 10 : 20 }
    if (applied.severity) params.severity = applied.severity
    if (applied.status) params.status = applied.status
    if (applied.from) params.date_from = zonedDayBoundary(applied.from)
    if (applied.to) params.date_to = zonedDayBoundary(applied.to, true)
    if (scope === 'hospital' && applied.q) params.q = applied.q
    try {
      const url = scope === 'patient' ? `/patients/${patientId}/alerts` : '/alerts'
      const r = await api.get(url, { params })
      setData(r.data)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [scope, patientId, page, applied, compact])

  useEffect(() => { load() }, [load])
  useRealtime(['alert.new', 'patient.acknowledged', 'reconnected'], (d) => {
    if (scope === 'hospital' || !d?.patient_id || d.patient_id === patientId) load()
  })

  const apply = (e) => {
    e?.preventDefault()
    setPage(1)
    setApplied(filters)
  }
  const reset = () => {
    setFilters(EMPTY)
    setApplied(EMPTY)
    setPage(1)
  }
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const setAndApply = (k) => (e) => {
    const next = { ...filters, [k]: e.target.value }
    setFilters(next)
    setApplied(next)
    setPage(1)
  }

  return (
    <div>
      <form onSubmit={apply} className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" data-testid="alert-filters">
        {scope === 'hospital' && (
          <div className="lg:col-span-2">
            <label className="label" htmlFor="f-q">Patient name or ID</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input id="f-q" className="input pl-9" placeholder="e.g. Aarav or PAT001" value={filters.q} onChange={set('q')} data-testid="filter-search" />
            </div>
          </div>
        )}
        <div>
          <label className="label" htmlFor="f-sev">Severity</label>
          <select id="f-sev" className="input" value={filters.severity} onChange={setAndApply('severity')} data-testid="filter-severity">
            <option value="">All severities</option><option value="yellow">Yellow</option><option value="orange">Orange</option><option value="red">Red</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={filters.status} onChange={setAndApply('status')} data-testid="filter-status">
            <option value="">All statuses</option><option value="pending">Pending</option><option value="acknowledged">Acknowledged</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-from">From date</label>
          <input id="f-from" type="date" className="input" value={filters.from} onChange={set('from')} data-testid="filter-from" />
        </div>
        <div>
          <label className="label" htmlFor="f-to">To date</label>
          <input id="f-to" type="date" className="input" value={filters.to} onChange={set('to')} data-testid="filter-to" />
        </div>
        <div className={`flex items-end gap-2 ${scope === 'hospital' ? 'lg:col-span-6 lg:justify-end' : 'lg:col-span-2'}`}>
          <button type="submit" className="btn-primary" data-testid="filter-apply"><Search className="h-4 w-4" />Apply</button>
          <button type="button" className="btn-ghost" onClick={reset} data-testid="filter-reset"><RotateCcw className="h-4 w-4" />Reset</button>
        </div>
      </form>

      {error && <div className="mb-3 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}
      <div className="card overflow-hidden">
        {!data ? <Spinner label="Loading alert history…" /> : data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={FileClock} title="No alerts found" message={JSON.stringify(applied) === JSON.stringify(EMPTY) ? 'No alerts have been recorded yet. Abnormal readings will appear here automatically.' : 'No alerts match these filters. Try resetting them.'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]" data-testid="alert-table">
              <thead className="bg-navy-900/60">
                <tr>
                  <th className="th">Date &amp; Time</th>
                  {scope === 'hospital' && <th className="th">Patient</th>}
                  <th className="th">Glucose</th><th className="th">Heart Rate</th><th className="th">SpO₂</th>
                  <th className="th">Severity</th><th className="th">Triggered by</th><th className="th">Status</th><th className="th">Acknowledged</th><th className="th" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.alert_id} className="border-t border-white/5 hover:bg-white/[0.03]" data-testid="alert-row" data-severity={a.overall_severity} data-status={a.alert_status}>
                    <td className="td whitespace-nowrap">{formatShort(a.created_at)}</td>
                    {scope === 'hospital' && (
                      <td className="td">
                        {patientLinkBase ? <Link className="font-medium hover:underline" to={`${patientLinkBase}/${a.patient_id}`}>{a.patient_name}</Link> : a.patient_name}
                        <div className="text-xs text-muted">{a.patient_id}</div>
                      </td>
                    )}
                    <td className="td tabular-nums">{a.glucose}</td>
                    <td className="td tabular-nums">{a.heart_rate}</td>
                    <td className="td tabular-nums">{a.spo2}%</td>
                    <td className="td"><SeverityBadge severity={a.overall_severity} /></td>
                    <td className="td text-xs text-muted">{a.triggered_by}</td>
                    <td className="td"><StatusBadge status={a.alert_status} /></td>
                    <td className="td text-xs text-muted">{a.acknowledged_at ? <>{a.acknowledged_by} · {formatDateTime(a.acknowledged_at)}</> : '—'}</td>
                    <td className="td"><button className="text-xs font-semibold text-brand-teal hover:underline" onClick={() => setSelected(a)} data-testid="alert-details-btn">Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      <AlertDetailModal alert={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
