"""Application settings, loaded from environment variables (see ../.env.example)."""
import json
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'glucosync.db'}")
        self.session_hours = float(os.getenv("SESSION_HOURS", "12"))
        self.cookie_name = os.getenv("SESSION_COOKIE_NAME", "glucosync_session")
        self.cookie_secure = _bool("COOKIE_SECURE", False)
        self.cors_origins = [
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if o.strip()
        ]
        self.simulation_interval_seconds = float(os.getenv("SIMULATION_INTERVAL_SECONDS", "5"))
        self.simulation_resume_on_restart = _bool("SIMULATION_RESUME_ON_RESTART", False)
        self.seed_demo_data = _bool("SEED_DEMO_DATA", True)
        self.app_timezone = os.getenv("APP_TIMEZONE", "Asia/Kolkata")
        self.his_mock_failure_rate = float(os.getenv("HIS_MOCK_FAILURE_RATE", "0.05"))
        self.red_escalation_minutes = int(os.getenv("RED_ESCALATION_MINUTES", "10"))
        self.orange_escalation_minutes = int(os.getenv("ORANGE_ESCALATION_MINUTES", "30"))
        self.device_api_key = os.getenv("DEVICE_API_KEY", "")
        self.consent_version = os.getenv("CONSENT_VERSION", "1.0")
        thresholds_path = os.getenv("THRESHOLDS_FILE", str(BASE_DIR / "thresholds.json"))
        with open(thresholds_path, encoding="utf-8") as fh:
            self.thresholds = json.load(fh)


settings = Settings()
