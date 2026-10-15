import asyncio

from fastapi import APIRouter, Depends, HTTPException

from auth import CurrentUser, require_patient
from schemas import GenerateReadingRequest, alert_out, reading_out
from services.alert_engine import ReadingValidationError
from services.simulation import generate_and_store, manager

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

# Every endpoint here is patient-only and acts on the authenticated patient's own ID:
# the request never carries a patient_id, and staff are rejected with 403.


@router.post("/start")
async def start(user: CurrentUser = Depends(require_patient)):
    return await manager.start(user.user_id)


@router.post("/stop")
async def stop(user: CurrentUser = Depends(require_patient)):
    return await manager.stop(user.user_id)


@router.get("/status")
async def status(user: CurrentUser = Depends(require_patient)):
    return await asyncio.to_thread(manager.status, user.user_id)


@router.post("/generate-reading")
async def generate_reading(body: GenerateReadingRequest | None = None, user: CurrentUser = Depends(require_patient)):
    """One SIMULATED reading. `scenario` forces normal/yellow/orange/red for safe demonstrations."""
    scenario = body.scenario if body else "random"
    try:
        reading, alert = await asyncio.to_thread(generate_and_store, user.user_id, scenario, None)
    except ReadingValidationError as exc:
        raise HTTPException(422, str(exc))
    return {
        "reading": reading_out(reading),
        "alert": alert_out(alert, patient_name=user.full_name, nurse_name="") if alert else None,
        "message": f"Simulated {reading.overall_severity.upper()} reading saved"
        + (f"; alert ALT{alert.alert_id:05d} created." if alert else "; no alert needed."),
    }
