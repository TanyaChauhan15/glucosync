"""SQLAlchemy ORM models. Table names follow the project specification (section 14)."""
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, UTCDateTime, utcnow

SEVERITIES = ("normal", "yellow", "orange", "red")
_SEV_SQL = "('normal','yellow','orange','red')"


class Patient(Base):
    __tablename__ = "patients"

    patient_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    contact_number: Mapped[str] = mapped_column(String(20), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(100), nullable=False)
    # Current HIS-sharing consent (the full audit trail lives in consent_history).
    his_consent_status: Mapped[str] = mapped_column(String(16), nullable=False, default="declined")
    his_consent_changed_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    updated_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow, onupdate=utcnow)
    account_status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")

    __table_args__ = (
        CheckConstraint("account_status IN ('active','suspended','closed')", name="ck_patient_status"),
        CheckConstraint("his_consent_status IN ('granted','declined','withdrawn')", name="ck_patient_consent"),
    )


class Staff(Base):
    __tablename__ = "staff"

    staff_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)

    __table_args__ = (CheckConstraint("role IN ('doctor','nurse')", name="ck_staff_role"),)


class AuthSession(Base):
    """Server-side login sessions. Logout sets revoked_at, so the token stops working immediately."""

    __tablename__ = "auth_sessions"

    session_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_type: Mapped[str] = mapped_column(String(10), nullable=False)  # patient | doctor | nurse
    user_id: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    created_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    expires_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False)
    revoked_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=True)


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    reading_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), nullable=False)
    glucose: Mapped[int] = mapped_column(Integer, nullable=False)
    heart_rate: Mapped[int] = mapped_column(Integer, nullable=False)
    spo2: Mapped[int] = mapped_column(Integer, nullable=False)
    glucose_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    heart_rate_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    spo2_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    overall_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    recorded_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False)
    received_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    source_type: Mapped[str] = mapped_column(String(12), nullable=False, default="simulated")

    __table_args__ = (
        Index("ix_readings_patient_time", "patient_id", "recorded_at"),
        CheckConstraint("source_type IN ('simulated','sensor','seed')", name="ck_reading_source"),
        CheckConstraint(f"overall_severity IN {_SEV_SQL}", name="ck_reading_sev"),
    )


class AcknowledgementBatch(Base):
    __tablename__ = "acknowledgement_batches"

    batch_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), nullable=False, index=True)
    nurse_id: Mapped[str] = mapped_column(ForeignKey("staff.staff_id"), nullable=False)
    acknowledged_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    alert_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    highest_severity: Mapped[str] = mapped_column(String(8), nullable=False, default="normal")

    nurse = relationship("Staff")


class Alert(Base):
    __tablename__ = "alerts"

    alert_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), nullable=False)
    reading_id: Mapped[int] = mapped_column(ForeignKey("sensor_readings.reading_id"), nullable=False, unique=True)
    glucose: Mapped[int] = mapped_column(Integer, nullable=False)
    heart_rate: Mapped[int] = mapped_column(Integer, nullable=False)
    spo2: Mapped[int] = mapped_column(Integer, nullable=False)
    glucose_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    heart_rate_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    spo2_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    overall_severity: Mapped[str] = mapped_column(String(8), nullable=False)
    triggering_parameters: Mapped[str] = mapped_column(String(64), nullable=False)
    alert_status: Mapped[str] = mapped_column(String(14), nullable=False, default="pending")
    source_type: Mapped[str] = mapped_column(String(12), nullable=False, default="simulated")
    created_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    acknowledged_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=True)
    acknowledged_by: Mapped[str] = mapped_column(ForeignKey("staff.staff_id"), nullable=True)
    acknowledgement_batch_id: Mapped[int] = mapped_column(
        ForeignKey("acknowledgement_batches.batch_id"), nullable=True, index=True
    )

    patient = relationship("Patient")
    acknowledger = relationship("Staff")

    __table_args__ = (
        Index("ix_alerts_patient_status", "patient_id", "alert_status"),
        Index("ix_alerts_created", "created_at"),
        CheckConstraint("alert_status IN ('pending','acknowledged')", name="ck_alert_status"),
        CheckConstraint("overall_severity IN ('yellow','orange','red')", name="ck_alert_sev"),
        CheckConstraint(
            "(alert_status = 'pending' AND acknowledged_at IS NULL AND acknowledged_by IS NULL) OR "
            "(alert_status = 'acknowledged' AND acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL "
            "AND acknowledgement_batch_id IS NOT NULL)",
            name="ck_alert_ack_consistency",
        ),
    )


class ConsentHistory(Base):
    __tablename__ = "consent_history"

    consent_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), nullable=False, index=True)
    consent_status: Mapped[str] = mapped_column(String(16), nullable=False)
    changed_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    consent_version: Mapped[str] = mapped_column(String(10), nullable=False)
    change_source: Mapped[str] = mapped_column(String(32), nullable=False)

    __table_args__ = (
        CheckConstraint("consent_status IN ('granted','declined','withdrawn')", name="ck_consent_status"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    notification_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.alert_id"), nullable=False, unique=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(8), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow, index=True)


class NotificationReceipt(Base):
    __tablename__ = "notification_receipts"

    receipt_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    notification_id: Mapped[int] = mapped_column(ForeignKey("notifications.notification_id"), nullable=False)
    nurse_id: Mapped[str] = mapped_column(ForeignKey("staff.staff_id"), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=True)

    __table_args__ = (
        UniqueConstraint("notification_id", "nurse_id", name="uq_receipt_nurse"),
        Index("ix_receipts_nurse_read", "nurse_id", "is_read"),
    )


class HISSyncLog(Base):
    __tablename__ = "his_sync_log"

    sync_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), nullable=False)
    data_type: Mapped[str] = mapped_column(String(20), nullable=False)  # observation | alert
    reference_id: Mapped[int] = mapped_column(Integer, nullable=True)
    sync_status: Mapped[str] = mapped_column(String(10), nullable=False)  # success | failed
    attempted_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    completed_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_his_patient_time", "patient_id", "attempted_at"),)


class MockHISRecord(Base):
    """The prototype's stand-in for the hospital's HIS: FHIR-shaped JSON resources received."""

    __tablename__ = "mock_his_records"

    record_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    received_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)


class SimulationState(Base):
    __tablename__ = "simulation_state"

    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), primary_key=True)
    is_running: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=True)
    stopped_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=True)
    last_generated_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    audit_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_type: Mapped[str] = mapped_column(String(10), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(16), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    target_patient_id: Mapped[str] = mapped_column(String(16), nullable=True, index=True)
    details: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
