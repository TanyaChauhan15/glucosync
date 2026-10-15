"""Future real-sensor ingestion. Disabled unless DEVICE_API_KEY is set.

A gateway (e.g. an ESP32 or phone app bridging a glucometer and pulse oximeter)
would POST here. Readings go through exactly the same pipeline as simulated ones,
with source_type='sensor'.
"""
import asyncio
import hmac

from fastapi import APIRouter, Header, HTTPException

from config import settings
from database import SessionLocal
from schemas import DeviceReading, alert_out, reading_out
from services.alert_engine import ReadingValidationError
from services.readings import ingest_reading

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _ingest(body: DeviceReading):
    db = SessionLocal()
    try:
        reading, alert = ingest_reading(db, body.patient_id, body.glucose, body.heart_rate, body.spo2,
                                        source_type="sensor", recorded_at=body.recorded_at)
        return {"reading": reading_out(reading), "alert": alert_out(alert) if alert else None}
    finally:
        db.close()


@router.post("/readings", status_code=201)
async def device_reading(body: DeviceReading, x_device_key: str = Header(default="")):
    if not settings.device_api_key:
        raise HTTPException(503, "Device ingestion is disabled (set DEVICE_API_KEY to enable)")
    if not hmac.compare_digest(x_device_key, settings.device_api_key):
        raise HTTPException(401, "Invalid device key")
    try:
        return await asyncio.to_thread(_ingest, body)
    except ReadingValidationError as exc:
        raise HTTPException(422, str(exc))
    except LookupError:
        raise HTTPException(404, "Unknown patient")
