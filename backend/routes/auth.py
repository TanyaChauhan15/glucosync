import json
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import (
    CurrentUser,
    create_session,
    dummy_verify,
    get_current_user,
    hash_password,
    revoke_session,
    verify_password,
)
from config import settings
from database import get_db, utcnow
from models import AuditLog, ConsentHistory, Patient, Staff
from schemas import PatientLogin, PatientSignup, StaffLogin, patient_out

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Simple in-memory brute-force throttle: 5 failures per identifier per 5 minutes.
_FAILS: dict[str, list[float]] = {}
_FAILS_LOCK = threading.Lock()
MAX_FAILS, WINDOW = 5, 300


def _check_throttle(key: str) -> None:
    now = time.time()
    with _FAILS_LOCK:
        recent = [t for t in _FAILS.get(key, []) if now - t < WINDOW]
        _FAILS[key] = recent
        if len(recent) >= MAX_FAILS:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                "Too many failed attempts. Please wait a few minutes and try again.")


def _record_fail(key: str) -> None:
    with _FAILS_LOCK:
        _FAILS.setdefault(key, []).append(time.time())


def _clear_fails(key: str) -> None:
    with _FAILS_LOCK:
        _FAILS.pop(key, None)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=int(settings.session_hours * 3600),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _next_patient_id(db: Session) -> str:
    ids = [pid for (pid,) in db.query(Patient.patient_id).filter(Patient.patient_id.like("PAT%"))]
    nums = [int(pid[3:]) for pid in ids if pid[3:].isdigit()]
    return f"PAT{(max(nums) + 1 if nums else 1):03d}"


@router.post("/patient/signup", status_code=201)
def patient_signup(body: PatientSignup, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(Patient).filter(func.lower(Patient.email) == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    pw_hash = hash_password(body.password)
    consent_status = "granted" if body.his_consent else "declined"
    for _ in range(5):  # retry if two signups race for the same generated ID
        now = utcnow()
        pid = _next_patient_id(db)
        patient = Patient(
            patient_id=pid, full_name=body.full_name, email=email, contact_number=body.contact_number,
            password_hash=pw_hash, his_consent_status=consent_status, his_consent_changed_at=now,
            created_at=now, updated_at=now,
        )
        db.add(patient)
        try:
            db.flush()  # insert the patient row before rows that reference it
        except IntegrityError:
            db.rollback()
            if db.query(Patient).filter(func.lower(Patient.email) == email).first():
                raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
            continue
        db.add(ConsentHistory(patient_id=pid, consent_status=consent_status, changed_at=now,
                              consent_version=settings.consent_version, change_source="signup"))
        db.add(AuditLog(actor_type="patient", actor_id=pid, action="signup", target_patient_id=pid,
                        details=json.dumps({"his_consent": consent_status})))
        try:
            db.commit()
            return {"message": f"Account created. Your Hospital Patient ID is {pid}.", "patient": patient_out(patient)}
        except IntegrityError:
            db.rollback()
            if db.query(Patient).filter(func.lower(Patient.email) == email).first():
                raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not allocate a patient ID, please retry")


@router.post("/patient/login")
def patient_login(body: PatientLogin, response: Response, db: Session = Depends(get_db)):
    key = f"p:{body.email.lower()}"
    _check_throttle(key)
    patient = db.query(Patient).filter(func.lower(Patient.email) == body.email.lower()).first()
    if patient is None:
        dummy_verify()
        _record_fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not verify_password(body.password, patient.password_hash):
        _record_fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if patient.account_status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is not active")
    _clear_fails(key)
    token, sess = create_session(db, "patient", patient.patient_id)
    _set_cookie(response, token)
    return {"user": {"user_type": "patient", "user_id": patient.patient_id, "full_name": patient.full_name},
            "expires_at": sess.expires_at.isoformat()}


@router.post("/staff/login")
def staff_login(body: StaffLogin, response: Response, db: Session = Depends(get_db)):
    sid = body.staff_id.strip().upper()
    key = f"s:{sid}"
    _check_throttle(key)
    staff = db.get(Staff, sid)
    label = "Doctor ID" if body.role == "doctor" else "Nurse ID"
    if staff is None:
        dummy_verify()
        _record_fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid {label} or password")
    if not verify_password(body.password, staff.password_hash) or staff.role != body.role:
        _record_fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid {label} or password")
    if not staff.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This staff account is disabled")
    _clear_fails(key)
    token, sess = create_session(db, staff.role, staff.staff_id)
    _set_cookie(response, token)
    return {"user": {"user_type": staff.role, "user_id": staff.staff_id, "full_name": staff.full_name},
            "expires_at": sess.expires_at.isoformat()}


@router.post("/logout")
def logout(request: Request, response: Response, user: CurrentUser = Depends(get_current_user),
           db: Session = Depends(get_db)):
    revoke_session(db, user.session_id)
    response.delete_cookie(settings.cookie_name, path="/")
    return {"message": "Logged out"}


@router.get("/session")
def session_status(request: Request, db: Session = Depends(get_db)):
    """Session check for page loads: always 200, so signed-out visitors do not produce errors."""
    from auth import _token_from, resolve_token

    user = resolve_token(db, _token_from(request.headers, request.cookies))
    if user is None:
        return {"authenticated": False, "user": None}
    return {"authenticated": True,
            "user": {"user_type": user.user_type, "user_id": user.user_id, "full_name": user.full_name}}


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return {"user_type": user.user_type, "user_id": user.user_id, "full_name": user.full_name}
