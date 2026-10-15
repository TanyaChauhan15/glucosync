"""MOCK Hospital Information System (HIS) integration.

This is not connected to any real hospital system. "Sharing" means building a
FHIR R4-shaped resource and handing it to `mock_his_receive`, which stores it in
the mock_his_records table and can be configured to fail randomly
(HIS_MOCK_FAILURE_RATE) so failed-sync handling can be demonstrated.

Consent model used by this prototype:
  * Local monitoring, alerting and nurse/doctor review inside GlucoSync are treated
    as part of the hospital's care pathway, authorised by the hospital (not by this
    optional consent). That assumption must be confirmed by the hospital's
    legal/privacy team before any real use.
  * Sending data on to the HIS is optional and happens only while the patient's
    HIS consent is "granted". Withdrawing consent stops future sharing; it does
    not delete local records or anything previously shared.

Observation codes use LOINC. SNOMED CT concepts are attached to alerts only as
candidate finding codes that need confirming in a licensed SNOMED CT release.
The numeric alert thresholds are project rules, not SNOMED CT values.
"""
import json
import random

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from database import utcnow
from models import Alert, HISSyncLog, MockHISRecord, Patient, SensorReading
from schemas import iso, sync_out

LOINC = {
    "glucose": ("2339-0", "Glucose [Mass/volume] in Blood", "mg/dL"),
    "heart_rate": ("8867-4", "Heart rate", "/min"),
    "spo2": ("59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry", "%"),
}

# Candidate SNOMED CT findings (verify against a licensed release before use).
SNOMED_CANDIDATES = {
    ("glucose", "high"): ("80394007", "Hyperglycemia"),
    ("glucose", "low"): ("302866003", "Hypoglycemia"),
    ("heart_rate", "high"): ("3424008", "Tachycardia"),
    ("heart_rate", "low"): ("48867003", "Bradycardia"),
    ("spo2", "low"): ("389087006", "Hypoxemia"),
}

NORMAL_MID = {"glucose": 130, "heart_rate": 80, "spo2": 98}


class MockHISError(Exception):
    pass


def observation_bundle(patient: Patient, reading: SensorReading) -> dict:
    entries = []
    for param in ("glucose", "heart_rate", "spo2"):
        code, display, unit = LOINC[param]
        entries.append(
            {
                "resource": {
                    "resourceType": "Observation",
                    "status": "final",
                    "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": display}]},
                    "subject": {"reference": f"Patient/{patient.patient_id}"},
                    "effectiveDateTime": iso(reading.recorded_at),
                    "valueQuantity": {
                        "value": getattr(reading, param),
                        "unit": unit,
                        "system": "http://unitsofmeasure.org",
                    },
                    "interpretation": [{"text": getattr(reading, f"{param}_severity")}],
                    "meta": {"tag": [{"code": reading.source_type, "display": "GlucoSync prototype data"}]},
                }
            }
        )
    return {"resourceType": "Bundle", "type": "collection", "entry": entries}


def alert_flag(patient: Patient, alert: Alert) -> dict:
    findings = []
    for param in alert.triggering_parameters.split(","):
        if not param:
            continue
        direction = "high" if getattr(alert, param) > NORMAL_MID[param] else "low"
        concept = SNOMED_CANDIDATES.get((param, direction))
        if concept:
            findings.append(
                {"system": "http://snomed.info/sct", "code": concept[0], "display": concept[1],
                 "_note": "candidate concept; verify in licensed SNOMED CT release"}
            )
    return {
        "resourceType": "Flag",
        "status": "active" if alert.alert_status == "pending" else "inactive",
        "code": {"text": f"GlucoSync prototype alert: {alert.overall_severity.upper()}", "coding": findings},
        "subject": {"reference": f"Patient/{patient.patient_id}"},
        "period": {"start": iso(alert.created_at)},
        "identifier": [{"value": f"ALT{alert.alert_id:05d}"}],
    }


def mock_his_receive(db: Session, patient_id: str, resource: dict) -> None:
    """Stand-in for an HTTP POST to the HIS FHIR endpoint."""
    if settings.his_mock_failure_rate > 0 and random.random() < settings.his_mock_failure_rate:
        raise MockHISError("Mock HIS endpoint unavailable (simulated failure)")
    db.add(MockHISRecord(patient_id=patient_id, resource_type=resource["resourceType"], payload=json.dumps(resource)))


def _attempt(db: Session, patient: Patient, data_type: str, reference_id: int, resource: dict) -> HISSyncLog:
    log = HISSyncLog(patient_id=patient.patient_id, data_type=data_type, reference_id=reference_id,
                     sync_status="pending", attempted_at=utcnow())
    db.add(log)
    try:
        mock_his_receive(db, patient.patient_id, resource)
        log.sync_status = "success"
    except MockHISError as exc:
        log.sync_status = "failed"
        log.error_message = str(exc)
    log.completed_at = utcnow()
    return log


def share_reading(db: Session, patient: Patient, reading: SensorReading, alert: Alert | None) -> list[HISSyncLog]:
    """Share a saved reading (and its alert) if, and only if, consent is currently granted."""
    if patient.his_consent_status != "granted":
        return []
    logs = [_attempt(db, patient, "observation", reading.reading_id, observation_bundle(patient, reading))]
    if alert is not None:
        logs.append(_attempt(db, patient, "alert", alert.alert_id, alert_flag(patient, alert)))
    db.commit()
    return logs


def sync_status(db: Session, patient_ids: list[str] | None = None) -> list[dict]:
    q = db.query(Patient)
    if patient_ids is not None:
        q = q.filter(Patient.patient_id.in_(patient_ids))
    out = []
    for p in q.order_by(Patient.patient_id).all():
        last_obs = (
            db.query(HISSyncLog)
            .filter(HISSyncLog.patient_id == p.patient_id, HISSyncLog.data_type == "observation",
                    HISSyncLog.sync_status == "success")
            .order_by(HISSyncLog.attempted_at.desc(), HISSyncLog.sync_id.desc())
            .first()
        )
        last_any = (
            db.query(HISSyncLog)
            .filter(HISSyncLog.patient_id == p.patient_id)
            .order_by(HISSyncLog.attempted_at.desc(), HISSyncLog.sync_id.desc())
            .first()
        )
        last_reading = db.get(SensorReading, last_obs.reference_id) if last_obs else None
        latest_alert = (
            db.query(Alert).filter(Alert.patient_id == p.patient_id).order_by(Alert.alert_id.desc()).first()
        )
        failed = (
            db.query(func.count(HISSyncLog.sync_id))
            .filter(HISSyncLog.patient_id == p.patient_id, HISSyncLog.sync_status == "failed")
            .scalar()
        )
        if p.his_consent_status != "granted":
            status = "not_shared_no_consent"
        elif last_any is None:
            status = "awaiting_data"
        else:
            status = last_any.sync_status
        out.append(
            {
                "patient_id": p.patient_id,
                "patient_name": p.full_name,
                "his_consent_status": p.his_consent_status,
                "consent_changed_at": iso(p.his_consent_changed_at),
                "sharing_status": status,
                "last_sync_at": iso(last_any.completed_at or last_any.attempted_at) if last_any else None,
                "last_shared_reading": {
                    "reading_id": last_reading.reading_id,
                    "glucose": last_reading.glucose,
                    "heart_rate": last_reading.heart_rate,
                    "spo2": last_reading.spo2,
                    "recorded_at": iso(last_reading.recorded_at),
                }
                if last_reading
                else None,
                "latest_alert_severity": latest_alert.overall_severity if latest_alert else None,
                "failed_attempts": failed,
            }
        )
    return out


def sync_history(db: Session, patient_id: str | None, page: int, page_size: int) -> dict:
    q = db.query(HISSyncLog)
    if patient_id:
        q = q.filter(HISSyncLog.patient_id == patient_id)
    total = q.count()
    rows = (
        q.order_by(HISSyncLog.attempted_at.desc(), HISSyncLog.sync_id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {"items": [sync_out(r) for r in rows], "total": total, "page": page, "page_size": page_size}
