import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, UserPlus } from 'lucide-react'
import AuthShell from './AuthShell'
import api, { errorMessage, fieldErrors } from '../services/api'
import { useToast } from '../context/ToastContext'

const CONSENT_TEXT = 'I consent to sharing my health monitoring data, sensor readings, and alert history with the Hospital Information System for clinical monitoring and care.'

function validate(f) {
  const e = {}
  if (!f.full_name.trim()) e.full_name = 'Full name cannot be empty.'
  else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(f.full_name.trim())) e.full_name = 'Use letters, spaces, apostrophes, dots and hyphens only.'
  if (!/^\+?[0-9]{10,15}$/.test(f.contact_number.replace(/[\s\-()]/g, ''))) e.contact_number = 'Enter a valid contact number (10–15 digits, optional +).'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.'
  const p = f.password
  if (p.length < 8 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p) || !/[^A-Za-z0-9]/.test(p)) e.password = 'At least 8 characters with uppercase, lowercase, a number and a special character.'
  if (!f.confirm_password) e.confirm_password = 'Please confirm your password.'
  else if (f.password !== f.confirm_password) e.confirm_password = 'Passwords do not match.'
  return e
}

export default function PatientSignup() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', contact_number: '', email: '', password: '', confirm_password: '', his_consent: false })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const v = validate(form)
    setErrors(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const r = await api.post('/auth/patient/signup', { ...form, full_name: form.full_name.trim(), email: form.email.trim() })
      toast('success', r.data.message)
      navigate('/login/patient', { state: { registered: true, message: `${r.data.message} Please log in.`, email: form.email.trim() } })
    } catch (err) {
      setErrors(fieldErrors(err))
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const field = (k, label, type = 'text', extra = {}) => (
    <div>
      <label className="label" htmlFor={k}>{label}</label>
      <input id={k} type={type} className={`input ${errors[k] ? 'border-red-500/70' : ''}`} value={form[k]} onChange={set(k)} data-testid={`signup-${k}`} aria-invalid={!!errors[k]} {...extra} />
      {errors[k] && <p className="mt-1 text-xs text-red-300" data-testid={`error-${k}`}>{errors[k]}</p>}
    </div>
  )

  return (
    <AuthShell title="Create Patient Account" subtitle="Register for remote monitoring" footer={<>Already registered? <Link className="font-semibold text-brand-teal hover:underline" to="/login/patient">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {field('full_name', 'Full Name', 'text', { autoComplete: 'name' })}
        {field('contact_number', 'Contact Number', 'tel', { placeholder: '+91 98765 43210', autoComplete: 'tel' })}
        {field('email', 'Email Address', 'email', { autoComplete: 'email' })}
        {field('password', 'Password', 'password', { autoComplete: 'new-password' })}
        {field('confirm_password', 'Confirm Password', 'password', { autoComplete: 'new-password' })}
        <div>
          <span className="label">Hospital Patient ID</span>
          <div className="input cursor-not-allowed text-muted" data-testid="signup-patient-id">Generated automatically after registration</div>
        </div>
        <label className="flex gap-3 rounded-xl border border-white/10 bg-navy-900 p-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-400" checked={form.his_consent} onChange={set('his_consent')} data-testid="signup-consent" />
          <span>
            <span className="text-white">{CONSENT_TEXT}</span>
            <span className="mt-1 block text-xs text-muted">Optional. You can register without it and change it later in Consent &amp; Privacy.</span>
          </span>
        </label>
        {error && <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert" data-testid="signup-error">{error}</div>}
        <button className="btn-teal w-full" disabled={busy} data-testid="signup-submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {busy ? 'Creating account…' : 'Create Account'}
        </button>
      </form>
    </AuthShell>
  )
}
