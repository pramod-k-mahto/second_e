# backend/app/database.py
import os
import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from .config import get_settings

_logger = logging.getLogger(__name__)

# Load settings
settings = get_settings()

DATABASE_URL = settings.database_url

# Build engine kwargs — enable SSL if DB_SSLMODE env var is set.
_connect_args: dict = {}
_sslmode = os.getenv("DB_SSLMODE", "").strip()
if _sslmode:
    _connect_args["sslmode"] = _sslmode
    _logger.info("Database SSL mode: %s", _sslmode)

# Pool size tuning for production.
# Defaults: pool_size=10, max_overflow=20 (total burst cap = 30 connections).
# Override via env vars for constrained environments.
engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_pre_ping=True,
    pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
    pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "30")),
    pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "1800")),
    connect_args=_connect_args if _connect_args else {},
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# Dependency for FastAPI routes
def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
