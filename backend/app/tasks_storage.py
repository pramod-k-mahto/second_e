from __future__ import annotations

from pathlib import Path
import secrets

from fastapi import HTTPException


DEFAULT_MAX_BYTES = 25 * 1024 * 1024

DEFAULT_ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
    "text/plain",
}


def get_uploads_base_dir() -> Path:
    base = Path(__file__).resolve().parents[1] / "uploads"
    base.mkdir(parents=True, exist_ok=True)
    return base


def task_upload_dir(*, tenant_id: int, task_id: int) -> Path:
    base = get_uploads_base_dir()
    p = base / "tenants" / str(tenant_id) / "tasks" / str(task_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def ensure_path_within_base(path: Path, base: Path) -> None:
    try:
        path.resolve().relative_to(base.resolve())
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid file path") from e


def validate_upload(*, content_type: str | None, size_bytes: int, allowed_types=None, max_bytes: int = DEFAULT_MAX_BYTES) -> None:
    allowed_types = allowed_types or DEFAULT_ALLOWED_CONTENT_TYPES

    if size_bytes > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large. Max {max_bytes} bytes")

    if content_type and content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported file type")


def generate_stored_filename(original_filename: str) -> str:
    suffix = ""
    if "." in original_filename:
        suffix = "." + original_filename.rsplit(".", 1)[1].lower()
    return secrets.token_hex(16) + suffix
