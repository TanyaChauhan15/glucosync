import { Link } from 'react-router-dom'
import { HOME, useAuth } from '../context/AuthContext'

export default function NotFound() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="text-5xl font-extrabold text-brand-teal">404</div>
      <p className="text-muted">This page does not exist.</p>
      <Link to={user ? HOME[user.user_type] : '/'} className="btn-primary" data-testid="notfound-home">Go to {user ? 'your dashboard' : 'the start page'}</Link>
    </div>
  )
}
