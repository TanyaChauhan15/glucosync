import axios from 'axios'

// Same-origin requests: Vite proxies /api and /ws to the FastAPI backend in development.
// The session lives in an HttpOnly cookie, so no token is ever stored in JavaScript.
const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 20000 })

let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    if (status === 401 && onUnauthorized && !url.includes('/auth/')) onUnauthorized()
    return Promise.reject(error)
  },
)

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error?.response) return 'Cannot reach the GlucoSync server. Check that the backend is running.'
  const detail = error.response.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
  return fallback
}

export function fieldErrors(error) {
  return error?.response?.data?.fields || {}
}

export default api
