"""Idempotent demo data. DEVELOPMENT ONLY: every seeded value is synthetic.

Demo password for all seeded accounts: Demo123!
Running this repeatedly (e.g. on every server start) never duplicates anything:
each block checks for its records before inserting.
"""
import random
from datetime import timedelta

from sqlalchemy.orm import Session

from auth import hash_password
from config import settings
from database import utcnow
from models import (
    AcknowledgementBatch,
    Alert,
    ConsentHistory,
    NotificationReceipt,
    Patient,
    SensorReading,
    SimulationState,
    Staff,
)
from services import his_integration, notifications
from services.alert_engine import classify, highest

DEMO_PASSWORD = "Demo123!"

STAFF = [
    ("DOC001", "Dr. Kavya Iyer", "doctor"),
    ("NUR001", "Meera Nair", "nurse"),
    ("NUR002", "Arjun Rao", "nurse"),
]

PATIENTS = [
    ("PAT001", "Aarav Mehta", "aarav@demo.local", "9876500001"),
    ("PAT002", "Priya Sharma", "priya@demo.local", "9876500002"),
    ("PAT003", "Rohan Patel", "rohan@demo.local", "9876500003"),
    ("PAT004", "Ananya Singh", "ananya@demo.local", "9876500004"),
]

# (minutes ago, glucose, heart rate, SpO2, acknowledgement group or None for pending)
EVENTS = {
    "PAT001": [
        (1200, 76, 88, 97, ("NUR002", 1185)),
        (1190, 262, 104, 96, ("NUR002", 1185)),
        (40, 265, 105, 92, None),
        (30, 315, 115, 88, None),
        (20, 185, 102, 95, None),
        (10, 320, 118, 89, None),
    ],
    "PAT002": [
        (600, 49, 98, 96, ("NUR001", 590)),
        (50, 140, 104, 97, None),
        (25, 62, 92, 97, None),
        (8, 150, 96, 91, None),
    ],
    "PAT003": [
        (35, 210, 84, 97, None),
        (15, 150, 80, 95, None),
    ],
    "PAT004": [
        (360, 130, 118, 97, ("NUR001", 345)),
        (350, 76, 92, 98, ("NUR001", 345)),
        (180, 48, 102, 95, ("NUR002", 170)),
    ],
}

CONSENT = {
    "PAT001": [("granted", 1440 * 3, "signup")],
    "PAT002": [("granted", 1440 * 2, "signup")],
    "PAT003": [("declined", 1440 * 2, "signup")],
    "PAT004": [("granted", 1440 * 4, "signup"), ("withdrawn", 120, "patient_portal")],
}


def seed_staff(db: Session) -> None:
    for sid, name, role in STAFF:
        if db.get(Staff, sid) is None:
            db.add(Staff(staff_id=sid, full_name=name, role=role, password_hash=hash_password(DEMO_PASSWORD)))
    db.commit()


def _reading(pid, minutes_ago, g, hr, s, now):
    c = classify(g, hr, s)
    t = now - timedelta(minutes=minutes_ago)
    return SensorReading(
        patient_id=pid, glucose=g, heart_rate=hr, spo2=s,
        glucose_severity=c.glucose_severity, heart_rate_severity=c.heart_rate_severity,
        spo2_severity=c.spo2_severity, overall_severity=c.overall_severity,
        recorded_at=t, received_at=t, source_type="seed",
    ), c


def seed_patient(db: Session, pid: str, name: str, email: str, phone: str) -> None:
    if db.get(Patient, pid) is not None:
        return
    now = utcnow()
    rng = random.Random(f"glucosync-{pid}")
    consent = CONSENT[pid]
    patient = Patient(
        patient_id=pid, full_name=name, email=email, contact_number=phone,
        password_hash=hash_password(DEMO_PASSWORD), is_demo=True,
        his_consent_status=consent[-1][0], his_consent_changed_at=now - timedelta(minutes=consent[-1][1]),
        created_at=now - timedelta(days=5), updated_at=now - timedelta(minutes=consent[-1][1]),
    )
    db.add(patient)
    db.flush()
    for status, minutes_ago, source in consent:
        db.add(ConsentHistory(patient_id=pid, consent_status=status, changed_at=now - timedelta(minutes=minutes_ago),
                              consent_version=settings.consent_version, change_source=source))

    events = EVENTS[pid]
    event_minutes = [e[0] for e in events]
    g, hr, s = rng.randint(110, 140), rng.randint(70, 85), rng.randint(97, 99)
    for minutes_ago in range(1440, 1, -5):
        if any(abs(minutes_ago - m) < 3 for m in event_minutes):
            continue
        g = max(90, min(170, g + rng.randint(-7, 7)))
        hr = max(64, min(95, hr + rng.randint(-3, 3)))
        s = max(96, min(99, s + rng.randint(-1, 1)))
        reading, _ = _reading(pid, minutes_ago, g, hr, s, now)
        db.add(reading)

    batches: dict[tuple, AcknowledgementBatch] = {}
    for minutes_ago, eg, ehr, es, ack in events:
        reading, c = _reading(pid, minutes_ago, eg, ehr, es, now)
        db.add(reading)
        db.flush()
        alert = Alert(
            patient_id=pid, reading_id=reading.reading_id, glucose=eg, heart_rate=ehr, spo2=es,
            glucose_severity=c.glucose_severity, heart_rate_severity=c.heart_rate_severity,
            spo2_severity=c.spo2_severity, overall_severity=c.overall_severity,
            triggering_parameters=",".join(c.triggering_parameters), alert_status="pending",
            source_type="seed", created_at=reading.recorded_at,
        )
        if ack is not None:
            if ack not in batches:
                b = AcknowledgementBatch(patient_id=pid, nurse_id=ack[0], acknowledged_at=now - timedelta(minutes=ack[1]),
                                         alert_count=0, highest_severity="normal")
                db.add(b)
                db.flush()
                batches[ack] = b
            b = batches[ack]
            alert.alert_status = "acknowledged"
            alert.acknowledged_at = b.acknowledged_at
            alert.acknowledged_by = b.nurse_id
            alert.acknowledgement_batch_id = b.batch_id
            b.alert_count += 1
            b.highest_severity = highest(b.highest_severity, c.overall_severity)
        db.add(alert)
        db.flush()
        note = notifications.create_for_alert(db, alert, patient)
        if ack is not None:
            db.flush()
            db.query(NotificationReceipt).filter(NotificationReceipt.notification_id == note.notification_id).update(
                {"is_read": True, "read_at": alert.acknowledged_at}, synchronize_session=False
            )
    db.add(SimulationState(patient_id=pid, is_running=False))
    db.commit()

    if patient.his_consent_status == "granted":
        latest = (
            db.query(SensorReading).filter(SensorReading.patient_id == pid)
            .order_by(SensorReading.recorded_at.desc()).first()
        )
        his_integration.share_reading(db, patient, latest, None)


def seed_all(db: Session) -> None:
    seed_staff(db)
    for row in PATIENTS:
        seed_patient(db, *row)
