import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { PageHeader, Spinner } from '../components/ui'
import api, { errorMessage } from '../services/api'
import { formatDateTime } from '../utils/format'

function Item({ label, value, testid }) {
  return (
    <div className="border-b border-white/5 py-3">
      <div className="label">{label}</div>
      <div className="font-medium" data-testid={testid}>{value}</div>
    </div>
  )
}

export default function PatientProfile() {
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.get('/patients/me').then((r) => setP(r.data)).catch((e) => setError(errorMessage(e))) }, [])
  return (
    <Layout>
      <PageHeader title="Profile" subtitle="Your registered patient information" />
      {error && <div className="text-red-300">{error}</div>}
      {!p ? !error && <Spinner /> : (
        <div className="card max-w-2xl p-5" data-testid="profile-card">
          <div className="grid gap-x-8 sm:grid-cols-2">
            <Item label="Full name" value={p.full_name} testid="profile-name" />
            <Item label="Hospital Patient ID" value={p.patient_id} testid="profile-id" />
            <Item label="Email" value={p.email} testid="profile-email" />
            <Item label="Contact number" value={p.contact_number} />
            <Item label="Account status" value={p.account_status === 'active' ? 'Active' : p.account_status} />
            <Item label="Registered on" value={formatDateTime(p.created_at)} />
            <Item label="HIS consent" value={<Link to="/patient/consent" className="text-brand-teal hover:underline">{p.his_consent_status} (manage)</Link>} />
            <Item label="Monitoring" value={p.monitoring ? 'Simulation running' : 'Simulation stopped'} />
          </div>
          <p className="mt-4 text-xs text-muted">To correct your name, email or contact number, please contact the hospital's patient services desk.</p>
        </div>
      )}
    </Layout>
  )
}
