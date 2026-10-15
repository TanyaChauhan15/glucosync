import { Loader2, Inbox } from 'lucide-react'
import { SEVERITY } from '../utils/format'

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-8 text-sm text-muted ${className}`} role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-teal" /> {label}
    </div>
  )
}

export function EmptyState({ title, message, icon: Icon = Inbox, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 py-10 text-center" data-testid="empty-state">
      <Icon className="h-8 w-8 text-muted" />
      <div className="font-semibold">{title}</div>
      {message && <p className="max-w-md text-sm text-muted">{message}</p>}
      {children}
    </div>
  )
}

export function SeverityBadge({ severity, size = 'sm', testid }) {
  if (!severity) return <span className="text-xs text-muted">—</span>
  const s = SEVERITY[severity] || SEVERITY.normal
  const label = severity === 'normal' ? 'Normal' : severity.charAt(0).toUpperCase() + severity.slice(1)
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span data-testid={testid} data-severity={severity} className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${s.bg} ${s.text} ${s.ring} ${pad}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
      {label}
    </span>
  )
}

export function StatusBadge({ status }) {
  const pending = status === 'pending'
  return (
    <span data-status={status} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${pending ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
      {pending ? 'Pending' : 'Acknowledged'}
    </span>
  )
}

export function StatCard({ label, value, icon: Icon, accent = '#3B82F6', testid, hint }) {
  return (
    <div className="card flex items-center gap-4 p-4" data-testid={testid}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}22`, color: accent }}>
        {Icon && <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight" data-testid={testid ? `${testid}-value` : undefined}>{value ?? '—'}</div>
        <div className="text-xs leading-tight text-muted">{label}</div>
        {hint && <div className="text-[11px] text-muted/70">{hint}</div>}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`card max-h-[90vh] w-full overflow-y-auto p-5 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost px-3 py-1" onClick={onClose} data-testid="modal-close">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Pagination({ page, pages, total, onPage }) {
  if (!total) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-sm text-muted">
      <span data-testid="pagination-total">{total} record{total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost px-3 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn-ghost px-3 py-1" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  )
}

export function SimulatedTag() {
  return <span className="rounded-md bg-brand-blue/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-300">Simulated data</span>
}
