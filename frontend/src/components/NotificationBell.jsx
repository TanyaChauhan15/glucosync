import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Check, CheckCheck, Volume2, VolumeX } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useRealtime } from '../context/RealtimeContext'
import { useToast } from '../context/ToastContext'
import { SeverityBadge, Spinner } from './ui'
import { formatShort } from '../utils/format'
import { isMuted, playAlertSound, setMuted } from '../utils/sound'

export default function NotificationBell() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [muted, setMutedState] = useState(isMuted())
  const ref = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/notifications', { params: { limit: 30 } })
      setItems(r.data.items)
      setUnread(r.data.unread_count)
    } catch (e) {
      toast('error', errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadCount = useCallback(() => {
    api.get('/notifications/unread-count').then((r) => setUnread(r.data.unread_count)).catch(() => {})
  }, [])

  useEffect(() => { loadCount() }, [loadCount])
  useRealtime('reconnected', loadCount)

  useRealtime('notification.new', (n) => {
    setUnread((c) => c + 1)
    setItems((list) => [{ ...n, is_read: false, alert_code: `ALT${String(n.alert_id).padStart(5, '0')}` }, ...list].slice(0, 30))
    playAlertSound(n.severity)
    if (n.severity === 'red') toast('red', n.message, { title: 'CRITICAL alert: urgent review', duration: 12000 })
    else if (n.severity === 'orange') toast('orange', n.message, { title: 'High-risk alert', duration: 8000 })
    else toast('yellow', n.message, { title: 'Caution alert', duration: 5000 })
  })

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) load()
  }

  const markRead = async (n) => {
    try {
      const r = await api.post(`/notifications/${n.notification_id}/read`)
      setItems((list) => list.map((x) => (x.notification_id === n.notification_id ? { ...x, is_read: true } : x)))
      setUnread(r.data.unread_count)
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all')
      setItems((list) => list.map((x) => ({ ...x, is_read: true })))
      setUnread(0)
      toast('success', 'All notifications marked as read. Patients still need to be acknowledged from the queue.')
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  const toggleMute = () => {
    setMuted(!muted)
    setMutedState(!muted)
    toast('info', !muted ? 'Notification sounds muted.' : 'Notification sounds on.')
  }

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button onClick={toggleMute} className="btn-ghost px-2 py-2" aria-label={muted ? 'Unmute notification sounds' : 'Mute notification sounds'} data-testid="mute-toggle" data-muted={muted}>
        {muted ? <VolumeX className="h-5 w-5 text-muted" /> : <Volume2 className="h-5 w-5" />}
      </button>
      <button onClick={toggle} className="btn-ghost relative px-2 py-2" aria-label="Notifications" data-testid="notification-bell">
        {muted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unread > 0 && (
          <span data-testid="unread-count" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sev-red px-1 text-[11px] font-bold">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[calc(100vw-2rem)] max-w-sm card p-0" data-testid="notification-panel">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="font-semibold">Notifications <span className="text-xs text-muted">({unread} unread)</span></div>
            <button className="text-xs font-semibold text-brand-teal hover:underline disabled:opacity-40" onClick={markAll} disabled={unread === 0} data-testid="mark-all-read">
              <CheckCheck className="mr-1 inline h-3.5 w-3.5" />Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? <Spinner /> : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</div>
            ) : items.map((n) => (
              <div key={n.notification_id} data-testid="notification-item" data-read={n.is_read} className={`flex gap-3 border-b border-white/5 px-4 py-3 text-sm ${n.is_read ? 'opacity-60' : 'bg-white/[0.03]'}`}>
                <div className="pt-0.5"><SeverityBadge severity={n.severity} /></div>
                <div className="min-w-0 flex-1">
                  <Link to={`/nurse/patients/${n.patient_id}`} onClick={() => setOpen(false)} className="font-semibold hover:underline">{n.patient_name} · {n.patient_id}</Link>
                  <div className="text-xs text-muted">{n.message}</div>
                  <div className="mt-1 text-[11px] text-muted">{formatShort(n.created_at)}</div>
                </div>
                {!n.is_read && (
                  <button className="self-start rounded-lg p-1.5 text-brand-teal hover:bg-white/10" onClick={() => markRead(n)} aria-label="Mark as read" title="Mark as read" data-testid="mark-read">
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 text-[11px] text-muted">Reading a notification does not acknowledge the patient.</div>
        </div>
      )}
    </div>
  )
}
