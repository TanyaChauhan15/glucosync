from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from auth import CurrentUser, ensure_patient_access, get_current_user, require_nurse, require_patient, require_staff
from database import get_db, utcnow
from models import AcknowledgementBatch, Patient, SensorReading
from routes.alerts import query_alerts
from schemas import batch_out, patient_out, reading_out
from services import queue
from services.acknowledgement import NothingPending, acknowledge_patient
from services.realtime import hub

router = APIRouter(prefix="/api/patients", tags=["patients"])


def _get_patient(db: Session, patient_id: str) -> Patient:
    p = db.get(Patient, patient_id)
    if p is None:
        raise HTTPException(404, "Patient not found")
    return p


@router.get("/me")
def my_profile(user: CurrentUser = Depends(require_patient), db: Session = Depends(get_db)):
    p = _get_patient(db, user.user_id)
    sim = queue.running_patients(db)
    return {**patient_out(p), "monitoring": p.patient_id in sim}


@router.get("")
def list_patients(
    q: str | None = Query(None, max_length=80),
    user: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(Patient).filter(Patient.account_status == "active")
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Patient.full_name.ilike(like), Patient.patient_id.ilike(like)))
    patients = query.order_by(Patient.patient_id).all()
    latest = queue.latest_readings(db)
    pending = queue.pending_by_patient(db)
    running = queue.running_patients(db)
    items = []
    for p in patients:
        r = latest.get(p.patient_id)
        pend = pending.get(p.patient_id)
        items.append({
            "patient_id": p.patient_id,
            "full_name": p.full_name,
            "monitoring": p.patient_id in running,
            "latest_reading": reading_out(r) if r else None,
            "overall_severity": r.overall_severity if r else None,
            "pending_count": pend["count"] if pend else 0,
            "highest_pending_severity": pend["highest"] if pend else None,
            "his_consent_status": p.his_consent_status,
        })
    return {"items": items}


@router.get("/{patient_id}")
def get_patient(patient_id: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_patient_access(user, patient_id)
    p = _get_patient(db, patient_id)
    return {**patient_out(p), "monitoring": patient_id in queue.running_patients(db)}


@router.get("/{patient_id}/readings")
def get_readings(
    patient_id: str,
    minutes: int = Query(60, ge=1, le=60 * 24 * 30),
    since: datetime | None = None,
    limit: int = Query(3000, ge=1, le=5000),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_patient_access(user, patient_id)
    _get_patient(db, patient_id)
    start = since or (utcnow() - timedelta(minutes=minutes))
    rows = (
        db.query(SensorReading)
        .filter(SensorReading.patient_id == patient_id, SensorReading.recorded_at >= start)
        .order_by(SensorReading.recorded_at.desc(), SensorReading.reading_id.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return {"items": [reading_out(r) for r in rows], "from": start.isoformat()}


@router.get("/{patient_id}/latest-reading")
def latest_reading(patient_id: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_patient_access(user, patient_id)
    _get_patient(db, patient_id)
    r = (
        db.query(SensorReading)
        .filter(SensorReading.patient_id == patient_id)
        .order_by(SensorReading.recorded_at.desc(), SensorReading.reading_id.desc())
        .first()
    )
    return {"reading": reading_out(r) if r else None}


@router.get("/{patient_id}/alerts")
def patient_alerts(
    patient_id: str,
    severity: Literal["yellow", "orange", "red"] | None = None,
    status: Literal["pending", "acknowledged"] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_patient_access(user, patient_id)
    _get_patient(db, patient_id)
    return query_alerts(db, patient_id, None, severity, status, date_from, date_to, page, page_size)


@router.get("/{patient_id}/acknowledgements")
def patient_acknowledgements(patient_id: str, user: CurrentUser = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    ensure_patient_access(user, patient_id)
    _get_patient(db, patient_id)
    rows = (
        db.query(AcknowledgementBatch)
        .options(joinedload(AcknowledgementBatch.nurse))
        .filter(AcknowledgementBatch.patient_id == patient_id)
        .order_by(AcknowledgementBatch.acknowledged_at.desc(), AcknowledgementBatch.batch_id.desc())
        .all()
    )
    return {"items": [batch_out(b) for b in rows]}


@router.post("/{patient_id}/acknowledge")
def acknowledge(patient_id: str, user: CurrentUser = Depends(require_nurse), db: Session = Depends(get_db)):
    """Acknowledge ALL of this patient's currently pending alerts as one audited batch."""
    _get_patient(db, patient_id)
    try:
        batch = acknowledge_patient(db, patient_id, user.user_id)
    except NothingPending:
        hub.publish("queue.updated", {"patient_id": patient_id, "reason": "noop"}, audience="staff")
        return {"acknowledged_count": 0, "batch": None,
                "message": "No pending alerts remain for this patient (already acknowledged)."}
    data = batch_out(batch)
    hub.publish("patient.acknowledged", {"patient_id": patient_id, "batch": data}, audience="all",
                patient_id=patient_id)
    hub.publish("queue.updated", {"patient_id": patient_id, "reason": "acknowledged"}, audience="staff")
    return {"acknowledged_count": batch.alert_count, "batch": data,
            "message": f"Acknowledged {batch.alert_count} pending alert(s) for {patient_id}."}
