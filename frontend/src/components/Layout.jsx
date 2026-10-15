import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Activity, Bell, FileClock, LayoutDashboard, LogOut, Menu, Network, ShieldCheck, User, X, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRealtimeStatus } from '../context/RealtimeContext'
import { useToast } from '../context/ToastContext'
import NotificationBell from './NotificationBell'
import UrgentBanner from './UrgentBanner'

const NAV = {
  patient: [
    { to: '/patient/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/patient/alerts', label: 'Alert History', icon: FileClock },
    { to: '/patient/consent', label: 'Consent & Privacy', icon: ShieldCheck },
    { to: '/patient/profile', label: 'Profile', icon: User },
  ],
  nurse: [
    { to: '/nurse/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/nurse/alerts', label: 'Alert History', icon: FileClock },
    { to: '/nurse/his', label: 'Mock HIS', icon: Network },
  ],
  doctor: [
    { to: '/doctor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/doctor/alerts', label: 'Alert History', icon: FileClock },
    { to: '/doctor/his', label: 'Mock HIS', icon: Network },
  ],
}

const ROLE_LABEL = { patient: 'Patient', nurse: 'Nurse', doctor: 'Doctor' }

function ConnectionPill() {
  const status = useRealtimeStatus()
  const ok = status === 'connected'
  return (
    <span data-testid="ws-status" data-status={status} title="Live update connection" className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-yellow-400/10 text-yellow-300'}`}>
      {ok ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {ok ? 'Live' : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
    </span>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const items = NAV[user.user_type]

  const doLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      toast('success', 'You have been logged out.')
    } catch {
      toast('error', 'Logout request failed, local session cleared.')
    } finally {
      setLoggingOut(false)
      navigate('/', { replace: true })
    }
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4" aria-label="Main">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-teal/15 text-brand-teal"><Activity className="h-5 w-5" /></div>
        <div>
          <div className="text-lg font-bold leading-none">GlucoSync</div>
          <div className="text-[11px] text-muted">{ROLE_LABEL[user.user_type]} portal</div>
        </div>
      </div>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={() => setOpen(false)} data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand-blue/15 text-white ring-1 ring-brand-blue/40' : 'text-muted hover:bg-white/5 hover:text-white'}`}>
          <Icon className="h-4 w-4" /> {label}
        </NavLink>
      ))}
      <button onClick={doLogout} disabled={loggingOut} data-testid="nav-logout" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-red-500/10 hover:text-red-300">
        <LogOut className="h-4 w-4" /> {loggingOut ? 'Logging out…' : 'Logout'}
      </button>
      <div className="mt-auto rounded-xl bg-navy-950/60 p-3 text-[11px] leading-relaxed text-muted">
        Prototype for demonstration. Synthetic data only. Not a certified medical device.
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-navy-950 lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-white/5 bg-navy-900 lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="absolute left-0 top-0 h-full w-72 bg-navy-900" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 btn-ghost px-2 py-1" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-navy-950/85 px-4 py-3 backdrop-blur sm:px-6">
          <button className="btn-ghost px-2 py-2 lg:hidden" aria-label="Open menu" data-testid="menu-button" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" data-testid="header-user">{user.full_name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[user.user_type]} · {user.user_id}</div>
          </div>
          <ConnectionPill />
          {user.user_type === 'nurse' ? <NotificationBell /> : user.user_type === 'doctor' ? <span className="hidden text-xs text-muted sm:inline"><Bell className="mr-1 inline h-3.5 w-3.5" />Read-only access</span> : null}
        </header>
        {user.user_type === 'nurse' && <UrgentBanner />}
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  )
}
