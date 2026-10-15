"""GlucoSync API: FastAPI application entry point.

Run (dev):  uvicorn main:app --port 8000      (single worker; the simulator lives in-process)
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from database import SessionLocal
from migrations import run_migrations
from routes import alerts, auth, consent, devices, his, notifications, patients, realtime, simulation
from services.realtime import hub
from services.seed import seed_all
from services.simulation import manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(run_migrations)
    if settings.seed_demo_data:
        db = SessionLocal()
        try:
            await asyncio.to_thread(seed_all, db)
        finally:
            db.close()
    hub.bind_loop(asyncio.get_running_loop())
    await manager.reconcile_on_startup()
    yield
    await manager.shutdown()


app = FastAPI(title="GlucoSync API", version="1.0.0", lifespan=lifespan,
              description="Prototype remote patient monitoring API. Synthetic data only; not a medical device.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "Authorization"],
)


def _field_message(err: dict) -> str:
    loc = [str(x) for x in err.get("loc", []) if x not in ("body", "query", "path")]
    msg = err.get("msg", "Invalid value").removeprefix("Value error, ")
    return f"{loc[-1].replace('_', ' ')}: {msg}" if loc else msg


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    fields = {}
    for e in errors:
        loc = [str(x) for x in e.get("loc", []) if x not in ("body", "query", "path")]
        fields[loc[-1] if loc else "_"] = e.get("msg", "Invalid value").removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": "; ".join(_field_message(e) for e in errors),
                                                  "fields": fields})


for module in (auth, patients, consent, alerts, simulation, notifications, his, devices, realtime):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Optional: serve the production build of the frontend (npm run build) from the same origin.
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith(("api/", "ws")):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        candidate = DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
