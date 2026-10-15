import Layout from '../components/Layout'
import AlertHistoryView from '../components/AlertHistoryView'
import ThresholdInfo from '../components/ThresholdInfo'
import { PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'

// Used for both NurseAlertHistory and DoctorAlertHistory routes.
export default function StaffAlertHistory() {
  const { user } = useAuth()
  const base = user.user_type === 'nurse' ? '/nurse/patients' : '/doctor/patients'
  return (
    <Layout>
      <PageHeader title="Hospital Alert History" subtitle="All alerts for all patients in this hospital, loaded from the permanent alert database." />
      <AlertHistoryView scope="hospital" patientLinkBase={base} />
      <ThresholdInfo />
    </Layout>
  )
}
