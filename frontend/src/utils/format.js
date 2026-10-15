// All timestamps arrive from the API as UTC ISO strings and are shown in the hospital's
// configured timezone (APP_TIMEZONE on the backend, served by /api/config).
let TZ = 'Asia/Kolkata'
export function setTimezone(tz) {
  if (tz) TZ = tz
}
export function getTimezone() {
  return TZ
}

const fmt = (opts) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...opts })

export function formatDateTime(iso) {
  if (!iso) return '—'
  return fmt({ day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(iso))
}
export function formatShort(iso) {
  if (!iso) return '—'
  return fmt({ day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
}
export function formatDate(iso) {
  if (!iso) return '—'
  return fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}
export function formatTime(iso, seconds = true) {
  if (!iso) return '—'
  return fmt({ hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: true }).format(new Date(iso))
}
export function formatAxisTime(ms, rangeMinutes) {
  const opts = rangeMinutes > 360 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit', hour12: false }
  return fmt(opts).format(new Date(ms))
}
export function timeAgo(iso) {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

function tzOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - utcMs
}

// 'YYYY-MM-DD' (a calendar date in the hospital timezone) -> UTC ISO of its start or end.
export function zonedDayBoundary(dateStr, end = false) {
  if (!dateStr) return undefined
  const [y, m, d] = dateStr.split('-').map(Number)
  const guess = end ? Date.UTC(y, m - 1, d, 23, 59, 59, 999) : Date.UTC(y, m - 1, d, 0, 0, 0, 0)
  return new Date(guess - tzOffsetMs(guess, TZ)).toISOString()
}

export const PARAM_META = {
  glucose: { label: 'Blood Glucose', short: 'Glucose', unit: 'mg/dL', color: '#3B82F6' },
  heart_rate: { label: 'Heart Rate', short: 'Heart Rate', unit: 'BPM', color: '#2DD4BF' },
  spo2: { label: 'SpO₂', short: 'SpO₂', unit: '%', color: '#A78BFA' },
}

export const SEVERITY = {
  normal: { label: 'Normal', color: '#22C55E', text: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/40' },
  yellow: { label: 'Yellow · Caution', color: '#FACC15', text: 'text-yellow-300', bg: 'bg-yellow-400/15', ring: 'ring-yellow-400/50' },
  orange: { label: 'Orange · High Risk', color: '#F97316', text: 'text-orange-300', bg: 'bg-orange-500/15', ring: 'ring-orange-500/50' },
  red: { label: 'Red · Critical', color: '#EF4444', text: 'text-red-300', bg: 'bg-red-500/15', ring: 'ring-red-500/60' },
}
