import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2, LogIn } from 'lucide-react'
import AuthShell from './AuthShell'
import { HOME, useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { errorMessage } from '../services/api'

export default function StaffLogin() {
  const { loginStaff, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [role, setRole] = useState('nurse')
  const [staffId, setStaffId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={HOME[user.user_type]} replace />
  const idLabel = role === 'doctor' ? 'Doctor ID' : 'Nurse ID'

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!staffId.trim() || !password) return setError(`Enter your ${idLabel} and password.`)
    setBusy(true)
    try {
      const u = await loginStaff(staffId.trim(), password, role)
      toast('success', `Signed in as ${u.full_name}.`)
      navigate(HOME[u.user_type], { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Hospital Staff Login" subtitle="Hospital-issued accounts only. Staff cannot self-register.">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-navy-900 p-1" role="tablist">
        {['doctor', 'nurse'].map((r) => (
          <button key={r} role="tab" aria-selected={role === r} onClick={() => { setRole(r); setError('') }} data-testid={`role-${r}`}
            className={`rounded-lg py-2 text-sm font-semibold transition ${role === r ? 'bg-brand-teal text-navy-950' : 'text-muted hover:text-white'}`}>
            {r === 'doctor' ? 'Doctor' : 'Nurse'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="staff-id">{idLabel}</label>
          <input id="staff-id" className="input uppercase" placeholder={role === 'doctor' ? 'DOC001' : 'NUR001'} value={staffId} onChange={(e) => setStaffId(e.target.value)} autoComplete="username" data-testid="staff-id" />
        </div>
        <div>
          <label className="label" htmlFor="staff-password">Password</label>
          <input id="staff-password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="staff-password" />
        </div>
        {error && <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert" data-testid="login-error">{error}</div>}
        <button className="btn-primary w-full" disabled={busy} data-testid="staff-submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} {busy ? 'Signing in…' : `Login as ${role === 'doctor' ? 'Doctor' : 'Nurse'}`}
        </button>
      </form>
      <p className="mt-4 text-xs text-muted">Demo accounts (development only): Doctor DOC001 · Nurses NUR001, NUR002 · password Demo123!</p>
    </AuthShell>
  )
}
