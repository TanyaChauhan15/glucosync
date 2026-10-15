from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from auth import CurrentUser, ensure_patient_access, get_current_user, require_staff
from config import settings
from database import get_db
from models import Alert, Patient
from schemas import alert_out
from services import queue
from services.alert_engine import SEVERITY_DESCRIPTIONS, threshold_table

router = APIRouter(prefix="/api", tags=["alerts"])

Severity = Literal["yellow", "orange", "red"]
Status = Literal["pending", "acknowledged"]


def query_alerts(
    db: Session,
    patient_id: str | None = None,
    q: str | None = None,
    severity: str | None = None,
    status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    query = db.query(Alert).join(Patient, Patient.patient_id == Alert.patient_id)
    if patient_id:
        query = query.filter(Alert.patient_id == patient_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Patient.full_name.ilike(like), Patient.patient_id.ilike(like)))
    if severity:
        query = query.filter(Alert.overall_severity == severity)
    if status:
        query = query.filter(Alert.alert_status == status)
    if date_from:
        query = query.filter(Alert.created_at >= date_from)
    if date_to:
        query = query.filter(Alert.created_at <= date_to)
    total = query.count()
    rows = (
        query.options(joinedload(Alert.patient), joinedload(Alert.acknowledger))
        .order_by(Alert.created_at.desc(), Alert.alert_id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {"items": [alert_out(a) for a in rows], "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


@router.get("/config")
def app_config():
    """Public, non-secret settings the UI needs (timezone and the active prototype alert rules)."""
    return {
        "timezone": settings.app_timezone,
        "simulation_interval_seconds": settings.simulation_interval_seconds,
        "thresholds": threshold_table(),
        "severity_descriptions": SEVERITY_DESCRIPTIONS,
        "threshold_disclaimer": "Prototype demonstration rules supplied by the project. Not SNOMED CT "
        "thresholds and not clinically validated.",
        "escalation_policy": {
            "red_minutes": settings.red_escalation_minutes,
            "orange_minutes": settings.orange_escalation_minutes,
            "note": "Configurable placeholder. The hospital must approve the real escalation policy. "
            "Browser notifications are not a reliable emergency dispatch channel.",
        },
    }


@router.get("/alerts")
def list_alerts(
    q: str | None = Query(None, max_length=80),
    patient_id: str | None = None,
    severity: Severity | None = None,
    status: Status | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
):
    return query_alerts(db, patient_id, q, severity, status, date_from, date_to, page, page_size)


@router.get("/alerts/pending-by-patient")
def pending_by_patient(
    include_all_patients: bool = False,
    user: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
):
    return {"items": queue.queue_entries(db, include_all_patients)}


@router.get("/alerts/{alert_id}")
def get_alert(alert_id: int, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(404, "Alert not found")
    ensure_patient_access(user, alert.patient_id)
    return alert_out(alert)


@router.get("/dashboard/stats")
def stats(user: CurrentUser = Depends(require_staff), db: Session = Depends(get_db)):
    return queue.dashboard_stats(db)
