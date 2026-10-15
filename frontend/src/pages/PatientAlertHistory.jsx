import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Layout from '../components/Layout'
import AlertHistoryView from '../components/AlertHistoryView'
import ThresholdInfo from '../components/ThresholdInfo'
import { PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'

export default function PatientAlertHistory() {
  const { user } = useAuth()
  return (
    <Layout>
      <PageHeader title="Alert History" subtitle="Every alert generated from your readings, permanently stored. Acknowledgements are made by hospital nurses.">
        <Link to="/patient/dashboard" className="btn-ghost" data-testid="back-to-dashboard"><ArrowLeft className="h-4 w-4" /> Back to dashboard</Link>
      </PageHeader>
      <AlertHistoryView scope="patient" patientId={user.user_id} />
      <ThresholdInfo />
    </Layout>
  )
}
