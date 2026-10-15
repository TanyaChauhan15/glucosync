import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, LogIn } from 'lucide-react'
import AuthShell from './AuthShell'
import { HOME, useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { errorMessage } from '../services/api'

export default function PatientLogin() {
  const { loginPatient, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={HOME[user.user_type]} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) return setError('Enter your email and password.')
    setBusy(true)
    try {
      const u = await loginPatient(email.trim(), password)
      toast('success', `Welcome back, ${u.full_name}.`)
      navigate('/patient/dashboard', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Patient Login" subtitle="Sign in to your monitoring dashboard"
      footer={<>New patient? <Link className="font-semibold text-brand-teal hover:underline" to="/signup">Create an account</Link></>}>
      {location.state?.registered && (
        <div className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200" data-testid="signup-success">
          {location.state.message}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
        </div>
        {error && <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert" data-testid="login-error">{error}</div>}
        <button className="btn-primary w-full" disabled={busy} data-testid="login-submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} {busy ? 'Signing in…' : 'Login'}
        </button>
      </form>
      <p className="mt-4 text-xs text-muted">Demo accounts (development only): aarav@demo.local, priya@demo.local, rohan@demo.local, ananya@demo.local · password Demo123!</p>
    </AuthShell>
  )
}
