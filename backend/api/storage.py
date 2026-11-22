import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.drive import get_drive_client
from backend.models import DriveFile, DriveHealth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/storage", tags=["storage"])


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: Optional[str] = None  # default: the configured upload folder


async def _drive_call(what: str, fn, *args, **kwargs):
    """Run a Drive call; not-connected/bad-input -> 400, anything else -> 500."""
    try:
        drive = await get_drive_client()
        return await getattr(drive, fn)(*args, **kwargs)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error {what}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files", response_model=List[DriveFile])
async def list_files(folder_id: Optional[str] = None):
    """List files in a Drive folder (default: the configured upload folder)."""
    return await _drive_call("listing files", "list_files", folder_id=folder_id)


@router.post("/folders", response_model=DriveFile)
async def create_folder(body: FolderCreate):
    """Create a folder, e.g. to pick as the upload folder."""
    folder_id = await _drive_call("creating folder", "create_folder", body.name, parent_id=body.parent_id)
    return await _drive_call("getting folder", "get_file_metadata", folder_id)


@router.get("/files/{file_id}", response_model=DriveFile)
async def get_file(file_id: str):
    """Get metadata for a specific file or folder."""
    return await _drive_call("getting file metadata", "get_file_metadata", file_id)


@router.get("/health", response_model=DriveHealth)
async def health_check():
    """Check if Google Drive connection is working."""
    try:
        drive = await get_drive_client()
        await drive.list_files(page_size=1)
        return {"status": "healthy", "service": "google_drive"}
    except Exception as e:
        logger.warning(f"Health check failed: {e}")
        return {"status": "unhealthy", "service": "google_drive", "error": str(e)}
