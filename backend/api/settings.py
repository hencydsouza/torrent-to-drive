import logging
import os
from typing import Optional

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.config import ENV_OVERRIDES as ENV_KEYS, settings
from backend.models import AppSettings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])

CONFIG_PATH = "./config/settings.yaml"

# section -> editable keys (everything else in settings.yaml stays file/env-only)
EDITABLE = {
    "torrent": ["stream_to_drive", "stream_buffer_mb", "max_concurrent_downloads",
                "max_connections", "download_rate_limit", "upload_rate_limit"],
    "google_drive": ["chunk_size", "max_retries"],
}


class SettingsUpdate(BaseModel):
    stream_to_drive: Optional[bool] = None
    stream_buffer_mb: Optional[int] = Field(None, ge=256, le=1024 * 1024)
    max_concurrent_downloads: Optional[int] = Field(None, ge=1, le=50)
    max_connections: Optional[int] = Field(None, ge=10, le=5000)
    download_rate_limit: Optional[int] = Field(None, ge=0)  # bytes/s, 0 = unlimited
    upload_rate_limit: Optional[int] = Field(None, ge=0)
    chunk_size: Optional[int] = Field(None, ge=256 * 1024, le=1024 * 1024 * 1024)
    max_retries: Optional[int] = Field(None, ge=1, le=20)


def _current() -> dict:
    out = {k: getattr(getattr(settings, sec), k) for sec, keys in EDITABLE.items() for k in keys}
    out["drive_folder_id"] = settings.google_drive.shared_folder_id
    out["env_locked"] = [env for env in ENV_KEYS.values() if os.getenv(env) is not None]
    return out


@router.get("", response_model=AppSettings)
async def get_settings():
    return _current()


@router.put("", response_model=AppSettings)
async def update_settings(update: SettingsUpdate):
    changes = update.model_dump(exclude_none=True)
    if "chunk_size" in changes:  # Drive resumable chunks must be 256 KiB multiples
        changes["chunk_size"] = changes["chunk_size"] // (256 * 1024) * (256 * 1024)
    locked = [k for k in changes if k in ENV_KEYS and os.getenv(ENV_KEYS[k]) is not None]
    if locked:  # env wins on restart, so saving would silently revert
        raise HTTPException(409, f"Set by environment variable, edit .env instead: {', '.join(ENV_KEYS[k] for k in locked)}")

    data = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            data = yaml.safe_load(f) or {}

    for sec, keys in EDITABLE.items():
        for k in keys:
            if k in changes:
                data.setdefault(sec, {})[k] = changes[k]

    # Write the file first so a failed write leaves memory untouched
    with open(CONFIG_PATH, "w") as f:
        yaml.safe_dump(data, f, sort_keys=False)
    for sec, keys in EDITABLE.items():
        for k in keys:
            if k in changes:
                setattr(getattr(settings, sec), k, changes[k])

    # Apply live where the running services cache values
    from backend.torrent.engine import engine
    from backend.torrent import worker as worker_mod
    if engine:
        engine.apply_limits()
    if worker_mod._worker:
        worker_mod._worker.max_concurrent = settings.torrent.max_concurrent_downloads

    logger.info(f"Settings updated: {changes}")
    return _current()
