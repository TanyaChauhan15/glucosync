"""Patient-grouped alert queue and hospital dashboard statistics."""
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from database import utcnow
from models import AcknowledgementBatch, Alert, Patient, SensorReading, SimulationState, Staff
from schemas import iso, reading_out
from services.alert_engine import SEVERITY_RANK, highest


def latest_readings(db: Session) -> dict[str, SensorReading]:
    ranked = db.query(
        SensorReading.reading_id.label("rid"),
        func.row_number()
        .over(partition_by=SensorReading.patient_id,
              order_by=(SensorReading.recorded_at.desc(), SensorReading.reading_id.desc()))
        .label("rn"),
    ).subquery()
    rows = (
        db.query(SensorReading)
        .join(ranked, SensorReading.reading_id == ranked.c.rid)
        .filter(ranked.c.rn == 1)
        .all()
    )
    return {r.patient_id: r for r in rows}


def running_patients(db: Session) -> set[str]:
    return {pid for (pid,) in db.query(SimulationState.patient_id).filter(SimulationState.is_running.is_(True))}


def pending_by_patient(db: Session) -> dict[str, dict]:
    rows = (
        db.query(
            Alert.patient_id,
            Alert.overall_severity,
            func.count(Alert.alert_id),
            func.max(Alert.created_at),
            func.min(Alert.created_at),
        )
        .filter(Alert.alert_status == "pending")
        .group_by(Alert.patient_id, Alert.overall_severity)
        .all()
    )
    out: dict[str, dict] = {}
    for pid, sev, count, last_at, first_at in rows:
        e = out.setdefault(pid, {"count": 0, "highest": "normal", "last_at": None, "by_sev": {}, "oldest": {}})
        e["count"] += count
        e["highest"] = highest(e["highest"], sev)
        e["by_sev"][sev] = count
        e["oldest"][sev] = first_at
        if e["last_at"] is None or last_at > e["last_at"]:
            e["last_at"] = last_at
    return out


def _latest_batches(db: Session) -> dict[str, AcknowledgementBatch]:
    sub = (
        db.query(AcknowledgementBatch.patient_id, func.max(AcknowledgementBatch.batch_id).label("bid"))
        .group_by(AcknowledgementBatch.patient_id)
        .subquery()
    )
    rows = db.query(AcknowledgementBatch).join(sub, AcknowledgementBatch.batch_id == sub.c.bid).all()
    return {b.patient_id: b for b in rows}


def queue_entries(db: Session, include_all_patients: bool = False) -> list[dict]:
    """One entry per patient (never per alert), sorted by highest pending severity then recency."""
    patients = {p.patient_id: p for p in db.query(Patient).filter(Patient.account_status == "active")}
    latest = latest_readings(db)
    pending = pending_by_patient(db)
    batches = _latest_batches(db)
    running = running_patients(db)
    last_alert = dict(db.query(Alert.patient_id, func.max(Alert.created_at)).group_by(Alert.patient_id).all())
    total_alerts = dict(db.query(Alert.patient_id, func.count(Alert.alert_id)).group_by(Alert.patient_id).all())
    nurse_names = dict(db.query(Staff.staff_id, Staff.full_name).all())
    now = utcnow()

    entries = []
    for pid, p in patients.items():
        pend = pending.get(pid)
        if not include_all_patients and pend is None and pid not in batches:
            continue
        r = latest.get(pid)
        b = batches.get(pid)
        escalation = None
        if pend:
            for sev, minutes in (("red", settings.red_escalation_minutes), ("orange", settings.orange_escalation_minutes)):
                oldest = pend["oldest"].get(sev)
                if oldest is not None and now - oldest > timedelta(minutes=minutes):
                    escalation = {
                        "severity": sev,
                        "unacknowledged_minutes": int((now - oldest).total_seconds() // 60),
                        "policy_minutes": minutes,
                    }
                    break
        entries.append(
            {
                "patient_id": pid,
                "patient_name": p.full_name,
                "monitoring": pid in running,
                "latest_reading": reading_out(r) if r else None,
                "pending_count": pend["count"] if pend else 0,
                "pending_by_severity": pend["by_sev"] if pend else {},
                "highest_pending_severity": pend["highest"] if pend else None,
                "last_pending_alert_at": iso(pend["last_at"]) if pend else None,
                "last_alert_at": iso(last_alert.get(pid)),
                "total_alerts": total_alerts.get(pid, 0),
                "urgent": bool(pend and pend["highest"] == "red"),
                "escalation": escalation,
                "last_acknowledgement": {
                    "batch_id": b.batch_id,
                    "batch_code": f"ACK{b.batch_id:05d}",
                    "nurse_id": b.nurse_id,
                    "nurse_name": nurse_names.get(b.nurse_id),
                    "acknowledged_at": iso(b.acknowledged_at),
                    "alert_count": b.alert_count,
                    "highest_severity": b.highest_severity,
                }
                if b
                else None,
            }
        )
    entries.sort(
        key=lambda e: (
            SEVERITY_RANK.get(e["highest_pending_severity"] or "normal", 0),
            e["pending_count"] > 0,
            e["last_pending_alert_at"] or e["last_alert_at"] or "",
        ),
        reverse=True,
    )
    return entries


def dashboard_stats(db: Session) -> dict:
    total = db.query(func.count(Patient.patient_id)).filter(Patient.account_status == "active").scalar()
    running = running_patients(db)
    pending = pending_by_patient(db)
    pending_counts = dict(
        db.query(Alert.overall_severity, func.count(Alert.alert_id))
        .filter(Alert.alert_status == "pending")
        .group_by(Alert.overall_severity)
        .all()
    )
    latest = latest_readings(db)
    abnormal_now = [pid for pid, r in latest.items() if r.overall_severity != "normal"]
    critical = {pid for pid, e in pending.items() if e["highest"] == "red"} | {
        pid for pid, r in latest.items() if r.overall_severity == "red"
    }
    return {
        "total_patients": total,
        "monitored_patients": len(running),
        "patients_with_pending_alerts": len(pending),
        "patients_with_abnormal_latest_reading": len(abnormal_now),
        "critical_patients": len(critical),
        "pending_red": pending_counts.get("red", 0),
        "pending_orange": pending_counts.get("orange", 0),
        "pending_yellow": pending_counts.get("yellow", 0),
    }
