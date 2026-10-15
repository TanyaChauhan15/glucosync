"""Backend-controlled sensor simulation (clearly synthetic data, source_type='simulated').

One asyncio task per patient at most. The authoritative on/off state lives in
the simulation_state table, so the UI always reflects the backend. Run the API
with a single worker process (the default) so there is exactly one manager.

After a server restart, rows still marked running are reconciled: by default
they are marked stopped (no surprise data generation); set
SIMULATION_RESUME_ON_RESTART=true to resume them instead.
"""
import asyncio
import logging
import random

from config import settings
from database import SessionLocal, utcnow
from models import SimulationState
from schemas import iso
from services.readings import ingest_reading
from services.realtime import hub

log = logging.getLogger("glucosync.simulation")

NORMAL = {"glucose": (90, 170), "heart_rate": (65, 95), "spo2": (96, 99)}
BANDS = {
    "yellow": {"glucose": [(70, 79), (181, 250)], "heart_rate": [(50, 59), (101, 110)], "spo2": [(94, 95)]},
    "orange": {"glucose": [(54, 69), (251, 300)], "heart_rate": [(40, 49), (111, 130)], "spo2": [(90, 93)]},
    "red": {"glucose": [(40, 53), (301, 420)], "heart_rate": [(32, 39), (131, 160)], "spo2": [(82, 89)]},
}
RANDOM_WEIGHTS = [("normal", 0.70), ("yellow", 0.15), ("orange", 0.10), ("red", 0.05)]


def scenario_values(scenario: str, rng: random.Random, previous: dict | None = None) -> dict:
    """Synthetic values whose overall severity is exactly `scenario`."""
    if scenario == "random":
        roll, acc = rng.random(), 0.0
        for name, weight in RANDOM_WEIGHTS:
            acc += weight
            if roll <= acc:
                scenario = name
                break
    values = {}
    for param, (lo, hi) in NORMAL.items():
        if previous and lo <= previous.get(param, -1) <= hi:
            step = {"glucose": 8, "heart_rate": 4, "spo2": 1}[param]
            values[param] = max(lo, min(hi, previous[param] + rng.randint(-step, step)))
        else:
            values[param] = rng.randint(lo, hi)
    if scenario == "normal":
        return values
    primary = rng.choice(list(NORMAL))
    values[primary] = rng.randint(*rng.choice(BANDS[scenario][primary]))
    # Sometimes a second parameter is abnormal at a lower level, to show multi-parameter alerts.
    lower = {"orange": "yellow", "red": "orange"}.get(scenario)
    if lower and rng.random() < 0.4:
        second = rng.choice([p for p in NORMAL if p != primary])
        values[second] = rng.randint(*rng.choice(BANDS[lower][second]))
    return values


def generate_and_store(patient_id: str, scenario: str = "random", previous: dict | None = None):
    db = SessionLocal()
    try:
        values = scenario_values(scenario, random.Random(), previous)
        return ingest_reading(db, patient_id, values["glucose"], values["heart_rate"], values["spo2"],
                              source_type="simulated")
    finally:
        db.close()


def state_out(state: SimulationState | None, patient_id: str) -> dict:
    return {
        "patient_id": patient_id,
        "is_running": bool(state and state.is_running),
        "started_at": iso(state.started_at) if state else None,
        "stopped_at": iso(state.stopped_at) if state else None,
        "last_generated_at": iso(state.last_generated_at) if state else None,
        "interval_seconds": settings.simulation_interval_seconds,
    }


class SimulationManager:
    def __init__(self) -> None:
        self.tasks: dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def start(self, patient_id: str) -> dict:
        async with self._lock:
            db = SessionLocal()
            try:
                state = db.get(SimulationState, patient_id)
                if state is None:
                    state = SimulationState(patient_id=patient_id)
                    db.add(state)
                already = bool(state.is_running and patient_id in self.tasks and not self.tasks[patient_id].done())
                if not already:
                    state.is_running = True
                    state.started_at = utcnow()
                    state.stopped_at = None
                    db.commit()
                    self._spawn(patient_id)
                result = state_out(state, patient_id)
            finally:
                db.close()
        hub.publish("simulation.status", result, audience="all", patient_id=patient_id)
        return {**result, "already_running": already}

    async def stop(self, patient_id: str) -> dict:
        async with self._lock:
            task = self.tasks.pop(patient_id, None)
            if task:
                task.cancel()
            db = SessionLocal()
            try:
                state = db.get(SimulationState, patient_id)
                if state is None:
                    state = SimulationState(patient_id=patient_id, is_running=False)
                    db.add(state)
                if state.is_running:
                    state.is_running = False
                    state.stopped_at = utcnow()
                db.commit()
                result = state_out(state, patient_id)
            finally:
                db.close()
        hub.publish("simulation.status", result, audience="all", patient_id=patient_id)
        return result

    def status(self, patient_id: str) -> dict:
        db = SessionLocal()
        try:
            return state_out(db.get(SimulationState, patient_id), patient_id)
        finally:
            db.close()

    def _spawn(self, patient_id: str) -> None:
        self.tasks[patient_id] = asyncio.get_running_loop().create_task(self._run(patient_id))

    async def _run(self, patient_id: str) -> None:
        previous = None
        try:
            while True:
                try:
                    reading, _ = await asyncio.to_thread(generate_and_store, patient_id, "random", previous)
                    previous = {"glucose": reading.glucose, "heart_rate": reading.heart_rate, "spo2": reading.spo2}
                except Exception:
                    log.exception("Simulation tick failed for a patient; will retry")
                await asyncio.sleep(settings.simulation_interval_seconds)
        except asyncio.CancelledError:
            pass

    async def reconcile_on_startup(self) -> None:
        db = SessionLocal()
        try:
            rows = db.query(SimulationState).filter(SimulationState.is_running.is_(True)).all()
            ids = [r.patient_id for r in rows]
            if not settings.simulation_resume_on_restart:
                for r in rows:
                    r.is_running = False
                    r.stopped_at = utcnow()
                db.commit()
                ids = []
        finally:
            db.close()
        for pid in ids:
            self._spawn(pid)

    async def shutdown(self) -> None:
        for task in self.tasks.values():
            task.cancel()
        self.tasks.clear()


manager = SimulationManager()
