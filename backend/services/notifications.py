"""Nurse notifications: one notification per alert, one read-receipt per active nurse.

Reading a notification only changes that nurse's receipt. It never acknowledges
the patient; that needs the explicit Acknowledge Patient action.
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import utcnow
from models import Alert, Notification, NotificationReceipt, Patient, Staff
from schemas import alert_code, notification_out
from services.alert_engine import PARAMETER_LABELS

LEVEL_WORD = {"yellow": "CAUTION", "orange": "HIGH RISK", "red": "CRITICAL"}


def build_message(alert: Alert, patient: Patient) -> str:
    params = [PARAMETER_LABELS[p] for p in alert.triggering_parameters.split(",") if p]
    return (
        f"{LEVEL_WORD[alert.overall_severity]} ({alert.overall_severity.upper()}) alert {alert_code(alert.alert_id)} "
        f"for {patient.full_name} ({patient.patient_id}): glucose {alert.glucose} mg/dL, "
        f"heart rate {alert.heart_rate} BPM, SpO2 {alert.spo2}%. Triggered by {', '.join(params)}."
    )


def create_for_alert(db: Session, alert: Alert, patient: Patient) -> Notification:
    """Adds the notification and receipts to the caller's transaction (caller commits)."""
    note = Notification(
        alert_id=alert.alert_id,
        patient_id=patient.patient_id,
        severity=alert.overall_severity,
        message=build_message(alert, patient),
        created_at=alert.created_at,
    )
    db.add(note)
    db.flush()
    nurse_ids = [s for (s,) in db.query(Staff.staff_id).filter(Staff.role == "nurse", Staff.is_active.is_(True))]
    for nid in nurse_ids:
        db.add(NotificationReceipt(notification_id=note.notification_id, nurse_id=nid, is_read=False))
    return note


def list_for_nurse(db: Session, nurse_id: str, limit: int = 30, unread_only: bool = False) -> list[dict]:
    q = (
        db.query(Notification, NotificationReceipt, Patient.full_name)
        .join(NotificationReceipt, NotificationReceipt.notification_id == Notification.notification_id)
        .join(Patient, Patient.patient_id == Notification.patient_id)
        .filter(NotificationReceipt.nurse_id == nurse_id)
    )
    if unread_only:
        q = q.filter(NotificationReceipt.is_read.is_(False))
    rows = q.order_by(Notification.created_at.desc(), Notification.notification_id.desc()).limit(limit).all()
    return [notification_out(n, r.is_read, r.read_at, name) for n, r, name in rows]


def unread_count(db: Session, nurse_id: str) -> int:
    return (
        db.query(func.count(NotificationReceipt.receipt_id))
        .filter(NotificationReceipt.nurse_id == nurse_id, NotificationReceipt.is_read.is_(False))
        .scalar()
    )


def mark_read(db: Session, nurse_id: str, notification_id: int) -> bool:
    receipt = (
        db.query(NotificationReceipt)
        .filter(NotificationReceipt.nurse_id == nurse_id, NotificationReceipt.notification_id == notification_id)
        .first()
    )
    if receipt is None:
        return False
    if not receipt.is_read:
        receipt.is_read = True
        receipt.read_at = utcnow()
        db.commit()
    return True


def mark_all_read(db: Session, nurse_id: str) -> int:
    now = utcnow()
    count = (
        db.query(NotificationReceipt)
        .filter(NotificationReceipt.nurse_id == nurse_id, NotificationReceipt.is_read.is_(False))
        .update({"is_read": True, "read_at": now}, synchronize_session=False)
    )
    db.commit()
    return count
