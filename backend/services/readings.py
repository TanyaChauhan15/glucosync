"""The single ingestion pipeline used by simulation, demo buttons and (future) real devices.

validate -> save reading -> classify each parameter -> overall severity ->
create alert + nurse notification when abnormal -> commit -> optional HIS share
-> broadcast saved state over WebSockets.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from database import utcnow
from models import Alert, Patient, SensorReading, SimulationState
from schemas import alert_out, reading_out
from services import his_integration, notifications
from services.alert_engine import classify
from services.realtime import hub


def ingest_reading(
    db: Session,
    patient_id: str,
    glucose: int,
    heart_rate: int,
    spo2: int,
    source_type: str = "simulated",
    recorded_at: datetime | None = None,
    broadcast: bool = True,
) -> tuple[SensorReading, Alert | None]:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise LookupError(f"Unknown patient {patient_id}")

    c = classify(glucose, heart_rate, spo2)  # raises ReadingValidationError on bad input
    now = utcnow()
    reading = SensorReading(
        patient_id=patient_id,
        glucose=glucose,
        heart_rate=heart_rate,
        spo2=spo2,
        glucose_severity=c.glucose_severity,
        heart_rate_severity=c.heart_rate_severity,
        spo2_severity=c.spo2_severity,
        overall_severity=c.overall_severity,
        recorded_at=recorded_at or now,
        received_at=now,
        source_type=source_type,
    )
    db.add(reading)
    db.flush()

    alert = None
    note = None
    if c.is_abnormal:
        alert = Alert(
            patient_id=patient_id,
            reading_id=reading.reading_id,
            glucose=glucose,
            heart_rate=heart_rate,
            spo2=spo2,
            glucose_severity=c.glucose_severity,
            heart_rate_severity=c.heart_rate_severity,
            spo2_severity=c.spo2_severity,
            overall_severity=c.overall_severity,
            triggering_parameters=",".join(c.triggering_parameters),
            alert_status="pending",
            source_type=source_type,
            created_at=now,
        )
        db.add(alert)
        db.flush()
        note = notifications.create_for_alert(db, alert, patient)

    if source_type == "simulated":
        state = db.get(SimulationState, patient_id)
        if state is not None:
            state.last_generated_at = now
    db.commit()  # reading, alert, notification and receipts are saved atomically

    his_integration.share_reading(db, patient, reading, alert)

    if broadcast:
        hub.publish("reading.new", {"patient_id": patient_id, "reading": reading_out(reading)},
                    audience="all", patient_id=patient_id)
        if alert is not None:
            payload = alert_out(alert, patient_name=patient.full_name, nurse_name="")
            hub.publish("alert.new", {"patient_id": patient_id, "alert": payload},
                        audience="all", patient_id=patient_id)
            hub.publish(
                "notification.new",
                {"notification_id": note.notification_id, "patient_id": patient_id,
                 "patient_name": patient.full_name, "severity": note.severity, "message": note.message,
                 "alert_id": alert.alert_id, "created_at": payload["created_at"]},
                audience="nurses",
            )
            hub.publish("queue.updated", {"patient_id": patient_id, "reason": "new_alert"}, audience="staff")
    return reading, alert
