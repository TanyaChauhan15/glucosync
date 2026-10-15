"""Patient-level acknowledgement: one action acknowledges the patient's current pending alert group.

Atomicity: the batch row is inserted first, which on SQLite takes the database
write lock (on PostgreSQL the SELECT ... FOR UPDATE locks the pending rows).
The pending alerts are then selected and updated with `WHERE alert_status =
'pending'` inside that same transaction. A second nurse acknowledging the same
patient at the same moment waits for the lock, then finds nothing pending and
gets acknowledged_count = 0. An alert that arrives after the selection is not
in the batch and stays pending. Alerts are updated, never deleted or merged.
"""
import json

from sqlalchemy.orm import Session

from database import utcnow
from models import AcknowledgementBatch, Alert, AuditLog, Patient
from services.alert_engine import highest


class NothingPending(Exception):
    pass


def acknowledge_patient(db: Session, patient_id: str, nurse_id: str) -> AcknowledgementBatch:
    if db.get(Patient, patient_id) is None:
        raise LookupError(patient_id)
    now = utcnow()
    try:
        batch = AcknowledgementBatch(patient_id=patient_id, nurse_id=nurse_id, acknowledged_at=now,
                                     alert_count=0, highest_severity="normal")
        db.add(batch)
        db.flush()  # acquires the write lock

        pending = (
            db.query(Alert.alert_id, Alert.overall_severity)
            .filter(Alert.patient_id == patient_id, Alert.alert_status == "pending")
            .with_for_update()
            .all()
        )
        if not pending:
            raise NothingPending()
        ids = [a.alert_id for a in pending]
        updated = (
            db.query(Alert)
            .filter(Alert.alert_id.in_(ids), Alert.alert_status == "pending")
            .update(
                {
                    "alert_status": "acknowledged",
                    "acknowledged_at": now,
                    "acknowledged_by": nurse_id,
                    "acknowledgement_batch_id": batch.batch_id,
                },
                synchronize_session=False,
            )
        )
        if updated != len(ids):  # should be impossible while we hold the lock
            raise RuntimeError("Pending alert set changed during acknowledgement")
        batch.alert_count = updated
        batch.highest_severity = highest(*[a.overall_severity for a in pending])
        db.add(AuditLog(actor_type="nurse", actor_id=nurse_id, action="acknowledge_patient",
                        target_patient_id=patient_id,
                        details=json.dumps({"batch_id": batch.batch_id, "alert_ids": ids})))
        db.commit()
        db.refresh(batch)
        return batch
    except Exception:
        db.rollback()
        raise
