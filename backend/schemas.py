"""Pydantic request models and response serializers."""
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from models import AcknowledgementBatch, Alert, ConsentHistory, HISSyncLog, Notification, Patient, SensorReading
from services.alert_engine import PARAMETER_LABELS

PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def alert_code(alert_id: int) -> str:
    return f"ALT{alert_id:05d}"


def batch_code(batch_id: int | None) -> str | None:
    return f"ACK{batch_id:05d}" if batch_id else None


# ---------- requests ----------


class PatientSignup(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    contact_number: str
    password: str = Field(max_length=128)
    confirm_password: str
    his_consent: bool = False

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Full name is required")
        if not re.fullmatch(r"[A-Za-z][A-Za-z .'\-]*", v):
            raise ValueError("Full name may contain letters, spaces, apostrophes, dots and hyphens only")
        return v

    @field_validator("contact_number")
    @classmethod
    def _phone(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-()]", "", v)
        if not PHONE_RE.fullmatch(cleaned):
            raise ValueError("Contact number must contain 10 to 15 digits, optionally starting with +")
        return cleaned

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        problems = []
        if len(v) < 8:
            problems.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):
            problems.append("an uppercase letter")
        if not re.search(r"[a-z]", v):
            problems.append("a lowercase letter")
        if not re.search(r"[0-9]", v):
            problems.append("a number")
        if not re.search(r"[^A-Za-z0-9]", v):
            problems.append("a special character")
        if problems:
            raise ValueError("Password must contain " + ", ".join(problems))
        return v

    @model_validator(mode="after")
    def _match(self):
        if self.password != self.confirm_password:
            raise ValueError("Password and confirm password do not match")
        return self


class PatientLogin(BaseModel):
    # Plain format check (not EmailStr): seeded demo accounts use the reserved ".local" domain.
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=128)


class StaffLogin(BaseModel):
    staff_id: str = Field(min_length=1, max_length=16)
    password: str = Field(min_length=1, max_length=128)
    role: Literal["doctor", "nurse"]


class ConsentUpdate(BaseModel):
    consent: bool


class GenerateReadingRequest(BaseModel):
    scenario: Literal["random", "normal", "yellow", "orange", "red"] = "random"


class DeviceReading(BaseModel):
    patient_id: str
    glucose: int
    heart_rate: int
    spo2: int
    recorded_at: datetime | None = None


# ---------- responses ----------


def patient_out(p: Patient) -> dict:
    return {
        "patient_id": p.patient_id,
        "full_name": p.full_name,
        "email": p.email,
        "contact_number": p.contact_number,
        "account_status": p.account_status,
        "his_consent_status": p.his_consent_status,
        "his_consent_changed_at": iso(p.his_consent_changed_at),
        "created_at": iso(p.created_at),
        "updated_at": iso(p.updated_at),
    }


def reading_out(r: SensorReading) -> dict:
    return {
        "reading_id": r.reading_id,
        "patient_id": r.patient_id,
        "glucose": r.glucose,
        "heart_rate": r.heart_rate,
        "spo2": r.spo2,
        "glucose_severity": r.glucose_severity,
        "heart_rate_severity": r.heart_rate_severity,
        "spo2_severity": r.spo2_severity,
        "overall_severity": r.overall_severity,
        "recorded_at": iso(r.recorded_at),
        "received_at": iso(r.received_at),
        "source_type": r.source_type,
    }


def alert_out(a: Alert, patient_name: str | None = None, nurse_name: str | None = None) -> dict:
    params = [p for p in a.triggering_parameters.split(",") if p]
    return {
        "alert_id": a.alert_id,
        "alert_code": alert_code(a.alert_id),
        "patient_id": a.patient_id,
        "patient_name": patient_name if patient_name is not None else (a.patient.full_name if a.patient else None),
        "reading_id": a.reading_id,
        "glucose": a.glucose,
        "heart_rate": a.heart_rate,
        "spo2": a.spo2,
        "glucose_severity": a.glucose_severity,
        "heart_rate_severity": a.heart_rate_severity,
        "spo2_severity": a.spo2_severity,
        "overall_severity": a.overall_severity,
        "triggering_parameters": params,
        "triggered_by": ", ".join(PARAMETER_LABELS[p] for p in params),
        "alert_status": a.alert_status,
        "source_type": a.source_type,
        "created_at": iso(a.created_at),
        "acknowledged_at": iso(a.acknowledged_at),
        "acknowledged_by": a.acknowledged_by,
        "acknowledged_by_name": nurse_name
        if nurse_name is not None
        else (a.acknowledger.full_name if a.acknowledger else None),
        "acknowledgement_batch_id": a.acknowledgement_batch_id,
        "acknowledgement_batch_code": batch_code(a.acknowledgement_batch_id),
    }


def batch_out(b: AcknowledgementBatch) -> dict:
    return {
        "batch_id": b.batch_id,
        "batch_code": batch_code(b.batch_id),
        "patient_id": b.patient_id,
        "nurse_id": b.nurse_id,
        "nurse_name": b.nurse.full_name if b.nurse else None,
        "acknowledged_at": iso(b.acknowledged_at),
        "alert_count": b.alert_count,
        "highest_severity": b.highest_severity,
    }


def consent_out(c: ConsentHistory) -> dict:
    return {
        "consent_id": c.consent_id,
        "patient_id": c.patient_id,
        "consent_status": c.consent_status,
        "changed_at": iso(c.changed_at),
        "consent_version": c.consent_version,
        "change_source": c.change_source,
    }


def notification_out(n: Notification, is_read: bool, read_at, patient_name: str | None) -> dict:
    return {
        "notification_id": n.notification_id,
        "alert_id": n.alert_id,
        "alert_code": alert_code(n.alert_id),
        "patient_id": n.patient_id,
        "patient_name": patient_name,
        "severity": n.severity,
        "message": n.message,
        "created_at": iso(n.created_at),
        "is_read": is_read,
        "read_at": iso(read_at),
    }


def sync_out(s: HISSyncLog) -> dict:
    return {
        "sync_id": s.sync_id,
        "patient_id": s.patient_id,
        "data_type": s.data_type,
        "reference_id": s.reference_id,
        "sync_status": s.sync_status,
        "attempted_at": iso(s.attempted_at),
        "completed_at": iso(s.completed_at),
        "error_message": s.error_message,
    }
