import { Link, Navigate } from 'react-router-dom'
import { Activity, ArrowRight, HeartPulse, Stethoscope, UserPlus } from 'lucide-react'
import { HOME, useAuth } from '../context/AuthContext'
import { Spinner } from '../components/ui'

export default function Landing() {
  const { user, loading, expired } = useAuth()
  if (loading) return <Spinner label="Loading…" />
  if (user) return <Navigate to={HOME[user.user_type]} replace />
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_#152238,_#080F1F_60%)] px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal/15 text-brand-teal"><Activity className="h-8 w-8" /></div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">GlucoSync</h1>
        <p className="mt-2 text-muted">Smart Remote Patient Monitoring System</p>
      </div>
      {expired && <div className="mb-4 rounded-xl bg-yellow-400/10 px-4 py-2 text-sm text-yellow-200" data-testid="session-expired">Your session has ended. Please log in again.</div>}
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <Link to="/login/patient" data-testid="choose-patient" className="card group p-6 transition hover:-translate-y-0.5 hover:ring-1 hover:ring-brand-blue/50">
          <HeartPulse className="h-8 w-8 text-brand-blue" />
          <div className="mt-4 text-lg font-bold">Login as Patient</div>
          <p className="mt-1 text-sm text-muted">View your live glucose, heart rate and SpO₂, your alert history and privacy settings.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue">Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
        </Link>
        <Link to="/login/staff" data-testid="choose-staff" className="card group p-6 transition hover:-translate-y-0.5 hover:ring-1 hover:ring-brand-teal/50">
          <Stethoscope className="h-8 w-8 text-brand-teal" />
          <div className="mt-4 text-lg font-bold">Login as Doctor / Nurse</div>
          <p className="mt-1 text-sm text-muted">Hospital-issued staff accounts: shared alert queue, patient trends and alert history.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-teal">Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
        </Link>
      </div>
      <Link to="/signup" data-testid="choose-signup" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-brand-teal/40 px-5 py-2.5 text-sm font-semibold text-brand-teal hover:bg-brand-teal/10">
        <UserPlus className="h-4 w-4" /> New Patient? Create an Account
      </Link>
      <p className="mt-10 max-w-xl text-center text-xs text-muted">Demonstration prototype for a single hospital (DH 308 project). All readings are simulated. Not a certified medical device and not for use with real patient data.</p>
    </div>
  )
}
