"""Applies Alembic migrations (alembic/versions) to DATABASE_URL at startup."""
from pathlib import Path

from alembic import command
from alembic.config import Config

from config import settings

HERE = Path(__file__).resolve().parent


def alembic_config() -> Config:
    cfg = Config(str(HERE / "alembic.ini"))
    cfg.set_main_option("script_location", str(HERE / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    return cfg


def run_migrations() -> None:
    command.upgrade(alembic_config(), "head")
