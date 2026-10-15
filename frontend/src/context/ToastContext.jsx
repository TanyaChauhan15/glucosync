import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)

const STYLES = {
  success: { icon: CheckCircle2, cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  error: { icon: XCircle, cls: 'border-red-500/50 bg-red-500/15 text-red-200' },
  info: { icon: Info, cls: 'border-brand-blue/40 bg-brand-blue/10 text-blue-200' },
  yellow: { icon: AlertTriangle, cls: 'border-yellow-400/50 bg-yellow-400/10 text-yellow-200' },
  orange: { icon: AlertTriangle, cls: 'border-orange-500/60 bg-orange-500/15 text-orange-200' },
  red: { icon: AlertTriangle, cls: 'border-red-500/70 bg-red-600/25 text-red-100' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const id = useRef(0)
  const dismiss = useCallback((tid) => setToasts((t) => t.filter((x) => x.id !== tid)), [])
  const push = useCallback((type, message, { title, duration = 4500 } = {}) => {
    const tid = ++id.current
    setToasts((t) => [...t.slice(-4), { id: tid, type, message, title }])
    if (duration) setTimeout(() => dismiss(tid), duration)
    return tid
  }, [dismiss])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-3 right-3 z-[100] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info
          const Icon = s.icon
          return (
            <div key={t.id} role="status" data-testid={`toast-${t.type}`} className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${s.cls}`}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1">
                {t.title && <div className="font-semibold">{t.title}</div>}
                <div>{t.message}</div>
              </div>
              <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
