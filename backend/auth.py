"""Password hashing, server-side sessions and role-based access dependencies.

Sessions are opaque random tokens. Only a SHA-256 hash of each token is stored,
so a leaked database cannot be replayed as a login. The browser receives the
token in an HttpOnly cookie (not readable by JavaScript); API clients may send
it as `Authorization: Bearer <token>` instead.
"""
import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta

import bcrypt
from fastapi import Depends, HTTPException, Request, WebSocket, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db, utcnow
from models import AuthSession, Patient, Staff


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# A real hash, so failed lookups take the same time as wrong passwords.
_DUMMY_HASH = hash_password("timing-equaliser")


def dummy_verify() -> None:
    verify_password("x", _DUMMY_HASH)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass
class CurrentUser:
    user_type: str  # patient | doctor | nurse
    user_id: str
    full_name: str
    session_id: int

    @property
    def is_staff(self) -> bool:
        return self.user_type in ("doctor", "nurse")


def create_session(db: Session, user_type: str, user_id: str) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    sess = AuthSession(
        token_hash=_hash_token(token),
        user_type=user_type,
        user_id=user_id,
        expires_at=utcnow() + timedelta(hours=settings.session_hours),
    )
    db.add(sess)
    db.commit()
    return token, sess


def _token_from(headers, cookies) -> str | None:
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return cookies.get(settings.cookie_name)


def resolve_token(db: Session, token: str | None) -> CurrentUser | None:
    if not token:
        return None
    sess = db.query(AuthSession).filter(AuthSession.token_hash == _hash_token(token)).first()
    if sess is None or sess.revoked_at is not None or sess.expires_at <= utcnow():
        return None
    if sess.user_type == "patient":
        p = db.get(Patient, sess.user_id)
        if p is None or p.account_status != "active":
            return None
        return CurrentUser("patient", p.patient_id, p.full_name, sess.session_id)
    s = db.get(Staff, sess.user_id)
    if s is None or not s.is_active or s.role != sess.user_type:
        return None
    return CurrentUser(s.role, s.staff_id, s.full_name, sess.session_id)


def revoke_session(db: Session, session_id: int) -> None:
    sess = db.get(AuthSession, session_id)
    if sess and sess.revoked_at is None:
        sess.revoked_at = utcnow()
        db.commit()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> CurrentUser:
    user = resolve_token(db, _token_from(request.headers, request.cookies))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated or session expired")
    return user


def websocket_user(websocket: WebSocket, db: Session) -> CurrentUser | None:
    token = _token_from(websocket.headers, websocket.cookies) or websocket.query_params.get("token")
    return resolve_token(db, token)


def require_roles(*roles: str):
    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.user_type not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission for this action")
        return user

    return dependency


require_patient = require_roles("patient")
require_nurse = require_roles("nurse")
require_staff = require_roles("doctor", "nurse")


def ensure_patient_access(user: CurrentUser, patient_id: str) -> None:
    """Patients may only touch their own records; staff may access every patient in this hospital."""
    if user.user_type == "patient" and user.user_id != patient_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Patients can only access their own records")
