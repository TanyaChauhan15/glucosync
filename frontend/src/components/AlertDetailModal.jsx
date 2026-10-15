import { Modal, SeverityBadge, StatusBadge } from './ui'
import { formatDate, formatDateTime, formatTime } from '../utils/format'
import { useConfig } from '../context/ConfigContext'

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

export default function AlertDetailModal({ alert, onClose }) {
  const config = useConfig()
  if (!alert) return null
  return (
    <Modal open={!!alert} onClose={onClose} title={`Alert ${alert.alert_code}`}>
      <div data-testid="alert-detail">
        <div className="mb-3 flex items-center gap-2">
          <SeverityBadge severity={alert.overall_severity} size="lg" />
          <StatusBadge status={alert.alert_status} />
        </div>
        <p className="mb-3 text-sm text-muted">{config?.severity_descriptions?.[alert.overall_severity]}</p>
        <Row label="Alert ID">{alert.alert_code}</Row>
        <Row label="Patient">{alert.patient_name} ({alert.patient_id})</Row>
        <Row label="Date">{formatDate(alert.created_at)}</Row>
        <Row label="Time">{formatTime(alert.created_at)}</Row>
        <Row label="Full timestamp (UTC)">{alert.created_at}</Row>
        <Row label="Glucose">{alert.glucose} mg/dL <SeverityBadge severity={alert.glucose_severity} /></Row>
        <Row label="Heart rate">{alert.heart_rate} BPM <SeverityBadge severity={alert.heart_rate_severity} /></Row>
        <Row label="SpO₂">{alert.spo2}% <SeverityBadge severity={alert.spo2_severity} /></Row>
        <Row label="Triggered by">{alert.triggered_by}</Row>
        <Row label="Source">{alert.source_type === 'sensor' ? 'Real sensor' : 'Simulated'}</Row>
        <Row label="Status">{alert.alert_status === 'pending' ? 'Pending' : 'Acknowledged'}</Row>
        {alert.alert_status === 'acknowledged' && (
          <>
            <Row label="Acknowledged by">{alert.acknowledged_by_name || alert.acknowledged_by} ({alert.acknowledged_by})</Row>
            <Row label="Acknowledged at">{formatDateTime(alert.acknowledged_at)}</Row>
            <Row label="Acknowledgement batch">{alert.acknowledgement_batch_code}</Row>
          </>
        )}
        <p className="mt-3 text-[11px] text-muted">Severity labels come from prototype demonstration rules, not diagnoses. Glucose above 300 mg/dL needs contextual clinical assessment.</p>
      </div>
    </Modal>
  )
}
