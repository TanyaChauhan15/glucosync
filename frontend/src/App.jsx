import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import PatientLogin from './pages/PatientLogin'
import StaffLogin from './pages/StaffLogin'
import PatientSignup from './pages/PatientSignup'
import PatientDashboard from './pages/PatientDashboard'
import PatientAlertHistory from './pages/PatientAlertHistory'
import ConsentPrivacy from './pages/ConsentPrivacy'
import PatientProfile from './pages/PatientProfile'
import NurseDashboard from './pages/NurseDashboard'
import NurseAlertHistory from './pages/NurseAlertHistory'
import DoctorDashboard from './pages/DoctorDashboard'
import DoctorAlertHistory from './pages/DoctorAlertHistory'
import PatientDetails from './pages/PatientDetails'
import HISIntegration from './pages/HISIntegration'
import NotFound from './pages/NotFound'

const guard = (roles, el) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/login/patient" element={<PatientLogin />} />
      <Route path="/login/staff" element={<StaffLogin />} />
      <Route path="/signup" element={<PatientSignup />} />

      <Route path="/patient" element={<Navigate to="/patient/dashboard" replace />} />
      <Route path="/patient/dashboard" element={guard(['patient'], <PatientDashboard />)} />
      <Route path="/patient/alerts" element={guard(['patient'], <PatientAlertHistory />)} />
      <Route path="/patient/consent" element={guard(['patient'], <ConsentPrivacy />)} />
      <Route path="/patient/profile" element={guard(['patient'], <PatientProfile />)} />

      <Route path="/nurse" element={<Navigate to="/nurse/dashboard" replace />} />
      <Route path="/nurse/dashboard" element={guard(['nurse'], <NurseDashboard />)} />
      <Route path="/nurse/alerts" element={guard(['nurse'], <NurseAlertHistory />)} />
      <Route path="/nurse/patients/:patientId" element={guard(['nurse'], <PatientDetails />)} />
      <Route path="/nurse/his" element={guard(['nurse'], <HISIntegration />)} />

      <Route path="/doctor" element={<Navigate to="/doctor/dashboard" replace />} />
      <Route path="/doctor/dashboard" element={guard(['doctor'], <DoctorDashboard />)} />
      <Route path="/doctor/alerts" element={guard(['doctor'], <DoctorAlertHistory />)} />
      <Route path="/doctor/patients/:patientId" element={guard(['doctor'], <PatientDetails />)} />
      <Route path="/doctor/his" element={guard(['doctor'], <HISIntegration />)} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
