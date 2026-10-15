import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api, { setUnauthorizedHandler } from '../services/api'

const AuthContext = createContext(null)

export const HOME = { patient: '/patient/dashboard', nurse: '/nurse/dashboard', doctor: '/doctor/dashboard' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/auth/session')
      setUser(r.data.user)
      return r.data.user
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    setUnauthorizedHandler(() => {
      setUser((u) => {
        if (u) setExpired(true)
        return null
      })
    })
  }, [refresh])

  const loginPatient = async (email, password) => {
    const r = await api.post('/auth/patient/login', { email, password })
    setExpired(false)
    setUser({ user_type: 'patient', user_id: r.data.user.user_id, full_name: r.data.user.full_name })
    return r.data.user
  }

  const loginStaff = async (staffId, password, role) => {
    const r = await api.post('/auth/staff/login', { staff_id: staffId, password, role })
    setExpired(false)
    setUser({ user_type: r.data.user.user_type, user_id: r.data.user.user_id, full_name: r.data.user.full_name })
    return r.data.user
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, expired, setExpired, loginPatient, loginStaff, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
