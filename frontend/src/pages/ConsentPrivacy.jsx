import { useCallback, useEffect, useState } from 'react'
import { Database, Loader2, Network, Save, ShieldCheck } from 'lucide-react'
import Layout from '../components/Layout'
import { PageHeader, Spinner } from '../components/ui'
import api, { errorMessage } from '../services/api'
import { useToast } from '../context/ToastContext'
import { formatDateTime } from '../utils/format'

const STATUS_TEXT = { granted: 'Granted', declined: 'Declined', withdrawn: 'Withdrawn' }
const SHARING_TEXT = {
  success: 'Last sharing attempt succeeded',
  failed: 'Last sharing attempt failed (will be shared again with the next reading)',
  awaiting_data: 'Consent granted; waiting for the next reading to share',
  not_shared_no_consent: 'Not shared: no active consent',
}

export default function ConsentPrivacy() {
  const toast = useToast()
  const [consent, setConsent] = useState(null)
  const [checked, setChecked] = useState(false)
  const [history, setHistory] = useState([])
  const [his, setHis] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [c, h, s] = await Promise.all([api.get('/patients/me/consent'), api.get('/patients/me/consent-history'), api.get('/his/sync-status')])
      setConsent(c.data)
      setChecked(c.data.consent)
      setHistory(h.data.items)
      setHis(s.data.items[0])
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.put('/patients/me/consent', { consent: checked })
      toast('success', r.data.message)
      await load()
    } catch (e) {
      toast('error', errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (!consent) return <Layout>{error ? <div className="text-red-300">{error}</div> : <Spinner />}</Layout>
  const dirty = checked !== consent.consent

  return (
    <Layout>
      <PageHeader title="Consent & Privacy" subtitle="Control whether your monitoring data is shared with the Hospital Information System (HIS)." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2" data-testid="consent-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="label">Patient name</div><div className="font-semibold">{consent.full_name}</div></div>
            <div><div className="label">Patient ID</div><div className="font-semibold">{consent.patient_id}</div></div>
            <div>
              <div className="label">Current HIS consent</div>
              <span data-testid="consent-status" data-status={consent.consent_status} className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${consent.consent_status === 'granted' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-muted'}`}>
                {STATUS_TEXT[consent.consent_status]}
              </span>
            </div>
            <div><div className="label">Date {consent.consent_status === 'granted' ? 'granted' : consent.consent_status}</div><div className="font-semibold" data-testid="consent-date">{formatDateTime(consent.changed_at)}</div></div>
          </div>

          <label className="mt-5 flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-navy-900 p-4">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-teal-400" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid="consent-toggle" />
            <span className="text-sm">{consent.statement}<span className="mt-1 block text-xs text-muted">Consent version {consent.consent_version}</span></span>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-teal" onClick={save} disabled={!dirty || saving} data-testid="consent-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
            </button>
            {dirty && <span className="text-xs text-yellow-300">Unsaved change</span>}
          </div>
        </div>

        <div className="card p-5 text-sm" data-testid="his-status">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Network className="h-4 w-4 text-brand-teal" /> Mock HIS sharing</div>
          <p className="text-muted">{SHARING_TEXT[his?.sharing_status] || '—'}</p>
          <div className="mt-3 text-xs text-muted">Last synchronisation: {formatDateTime(his?.last_sync_at)}</div>
          <p className="mt-3 rounded-lg bg-yellow-400/10 px-3 py-2 text-[11px] text-yellow-200">Mock HIS Integration. This prototype is not connected to any real hospital system.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-brand-teal" /> What is shared with the HIS (only while consent is granted)</div>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Each new sensor reading: glucose, heart rate and SpO₂, with time and severity (as LOINC-coded observations).</li>
            <li>Alert records generated from your readings (severity, triggering parameters, time).</li>
            <li>Your Hospital Patient ID, so the HIS can match the data to your hospital record.</li>
          </ul>
          <p className="mt-3 text-muted">Withdrawing consent stops future sharing. It does not delete your local monitoring records, and it does not recall data that was already shared before you withdrew.</p>
        </div>
        <div className="card p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Database className="h-4 w-4 text-brand-blue" /> What this setting does not change</div>
          <p className="text-muted">GlucoSync's own monitoring database and the hospital nurse alert system are separate from the optional HIS exchange. Your readings and alerts are still stored here and reviewed by this hospital's nurses and doctors as part of the monitoring service you enrolled in. This prototype assumes the hospital authorises that monitoring separately; that assumption must be confirmed by the hospital's privacy and legal teams before real use.</p>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="px-5 pt-4 font-semibold">Consent audit history</div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[480px]" data-testid="consent-history">
            <thead><tr><th className="th">Date &amp; time</th><th className="th">Decision</th><th className="th">Version</th><th className="th">Source</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.consent_id} className="border-t border-white/5" data-testid="consent-history-row">
                  <td className="td">{formatDateTime(h.changed_at)}</td>
                  <td className="td font-semibold">{STATUS_TEXT[h.consent_status]}</td>
                  <td className="td">{h.consent_version}</td>
                  <td className="td text-muted">{h.change_source === 'signup' ? 'At registration' : 'Patient portal'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
