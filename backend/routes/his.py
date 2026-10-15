import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import CurrentUser, ensure_patient_access, get_current_user, require_staff
from database import get_db
from models import MockHISRecord
from schemas import iso
from services import his_integration

router = APIRouter(prefix="/api/his", tags=["mock HIS"])

LABEL = "Mock HIS Integration (prototype; not connected to any real hospital system)"


@router.get("/sync-status")
def sync_status(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = [user.user_id] if user.user_type == "patient" else None
    return {"label": LABEL, "items": his_integration.sync_status(db, ids)}


@router.get("/sync-history")
def sync_history(
    patient_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.user_type == "patient":
        if patient_id and patient_id != user.user_id:
            ensure_patient_access(user, patient_id)
        patient_id = user.user_id
    return {"label": LABEL, **his_integration.sync_history(db, patient_id, page, page_size)}


@router.get("/mock-records/{patient_id}")
def mock_records(patient_id: str, limit: int = Query(10, ge=1, le=50),
                 user: CurrentUser = Depends(require_staff), db: Session = Depends(get_db)):
    """What the mock HIS has received for a patient (FHIR-shaped JSON)."""
    rows = (
        db.query(MockHISRecord)
        .filter(MockHISRecord.patient_id == patient_id)
        .order_by(MockHISRecord.record_id.desc())
        .limit(limit)
        .all()
    )
    return {"label": LABEL, "items": [
        {"record_id": r.record_id, "resource_type": r.resource_type, "received_at": iso(r.received_at),
         "payload": json.loads(r.payload)} for r in rows
    ]}
