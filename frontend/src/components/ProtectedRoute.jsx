import { Navigate, useLocation } from 'react-router-dom'
import { HOME, useAuth } from '../context/AuthContext'
import { Spinner } from './ui'

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="min-h-screen bg-navy-950"><Spinner label="Checking your session…" /></div>
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.user_type)) return <Navigate to={HOME[user.user_type]} replace />
  return children
}
