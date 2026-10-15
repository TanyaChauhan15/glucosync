import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import CurrentUser, require_patient
from config import settings
from database import get_db, utcnow
from models import AuditLog, ConsentHistory, Patient
from schemas import ConsentUpdate, consent_out, iso

router = APIRouter(prefix="/api/patients/me", tags=["consent"])

CONSENT_STATEMENT = (
    "I consent to sharing my health monitoring data, sensor readings, and alert history with the "
    "Hospital Information System for clinical monitoring and care."
)


def _current(p: Patient) -> dict:
    return {
        "patient_id": p.patient_id,
        "full_name": p.full_name,
        "consent": p.his_consent_status == "granted",
        "consent_status": p.his_consent_status,
        "changed_at": iso(p.his_consent_changed_at),
        "consent_version": settings.consent_version,
        "statement": CONSENT_STATEMENT,
    }


@router.get("/consent")
def get_consent(user: CurrentUser = Depends(require_patient), db: Session = Depends(get_db)):
    return _current(db.get(Patient, user.user_id))


@router.put("/consent")
def update_consent(body: ConsentUpdate, user: CurrentUser = Depends(require_patient), db: Session = Depends(get_db)):
    p = db.get(Patient, user.user_id)
    if body.consent:
        new_status = "granted"
    else:
        # Turning off a consent that was previously granted is a withdrawal; otherwise it stays declined.
        new_status = "withdrawn" if p.his_consent_status == "granted" else p.his_consent_status
    if new_status == p.his_consent_status:
        return {**_current(p), "changed": False, "message": "No change: your consent setting is already saved."}
    now = utcnow()
    previous = p.his_consent_status
    p.his_consent_status = new_status
    p.his_consent_changed_at = now
    p.updated_at = now
    db.add(ConsentHistory(patient_id=p.patient_id, consent_status=new_status, changed_at=now,
                          consent_version=settings.consent_version, change_source="patient_portal"))
    db.add(AuditLog(actor_type="patient", actor_id=p.patient_id, action="consent_change",
                    target_patient_id=p.patient_id, details=json.dumps({"from": previous, "to": new_status})))
    db.commit()
    msg = (
        "Consent granted. New readings and alerts will be shared with the mock HIS."
        if new_status == "granted"
        else "Consent withdrawn. Future HIS sharing has stopped. Your local monitoring records are kept, "
        "and data shared before withdrawal is not recalled by this action."
    )
    return {**_current(p), "changed": True, "message": msg}


@router.get("/consent-history")
def consent_history(user: CurrentUser = Depends(require_patient), db: Session = Depends(get_db)):
    rows = (
        db.query(ConsentHistory)
        .filter(ConsentHistory.patient_id == user.user_id)
        .order_by(ConsentHistory.changed_at.desc(), ConsentHistory.consent_id.desc())
        .all()
    )
    return {"items": [consent_out(c) for c in rows]}
