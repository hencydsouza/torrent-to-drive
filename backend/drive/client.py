import os
import logging
from pathlib import Path
from typing import Optional, List, Dict
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
import asyncio
import pickle
from backend.models import DriveFile
from backend.config import settings
from datetime import datetime

logger = logging.getLogger(__name__)

# Scopes required for Google Drive access
SCOPES = ["https://www.googleapis.com/auth/drive.file"]


class GoogleDriveClient:
    """Google Drive API client with OAuth2 authentication"""

    def __init__(self):
        self.credentials: Optional[Credentials] = None
        self.service = None
        self._folder_cache: Dict[str, str] = {}  # "parent:name" -> folder id

    async def authenticate(self, interactive: bool = False):
        """Authenticate with Google Drive using OAuth2"""
        token_file = settings.google_drive.token_file
        creds_file = settings.google_drive.credentials_file

        # Load existing credentials
        if os.path.exists(token_file):
            with open(token_file, "rb") as token:
                self.credentials = pickle.load(token)

        # Refresh or get new credentials
        if not self.credentials or not self.credentials.valid:
            if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                logger.info("Refreshing Google Drive credentials...")
                self.credentials.refresh(Request())
            else:
                if not os.path.exists(creds_file):
                    raise FileNotFoundError(
                        f"Credentials file not found: {creds_file}\n"
                        "Please download from Google Cloud Console and place it at this location."
                    )

                if not interactive:
                    # Never block a request on an interactive login (no browser/stdin in Docker)
                    raise RuntimeError(
                        "Google Drive not authorized yet. Run once:\n"
                        "  docker compose run --rm -p 8765:8765 torrent-to-drive python -m backend.drive.client\n"
                        "(or locally: python -m backend.drive.client)"
                    )

                logger.info("Starting OAuth2 flow for Google Drive...")
                flow = InstalledAppFlow.from_client_secrets_file(creds_file, SCOPES)
                # Fixed port + 0.0.0.0 so the redirect to http://localhost:8765 reaches the container via the published port
                self.credentials = flow.run_local_server(
                    host="localhost",
                    bind_addr="0.0.0.0",
                    port=int(os.getenv("OAUTH_PORT", "8765")),
                    open_browser=False,
                    authorization_prompt_message=(
                        "\nOpen this URL in your browser:\n\n{url}\n\n"
                        "Remote server? Google redirects to localhost:8765 on YOUR machine, so first run:\n"
                        "  ssh -L 8765:localhost:8765 <user>@<server>\n"
                    ),
                )

            # Save credentials
            os.makedirs(os.path.dirname(token_file), exist_ok=True)
            with open(token_file, "wb") as token:
                pickle.dump(self.credentials, token)

        # Build service
        self.service = build("drive", "v3", credentials=self.credentials)
        logger.info("Google Drive client authenticated successfully")

    async def list_files(self, folder_id: Optional[str] = None, page_size: int = 100) -> List[DriveFile]:
        """List files in the specified folder or shared folder"""
        if not self.service:
            await self.authenticate()

        folder_id = folder_id or settings.google_drive.shared_folder_id
        if not folder_id:
            raise ValueError("Google Drive folder ID not configured")

        try:
            query = f"'{folder_id}' in parents and trashed=false"
            results = (
                self.service.files()
                .list(
                    q=query,
                    pageSize=page_size,
                    fields="files(id, name, size, mimeType, createdTime, webViewLink, webContentLink)",
                    orderBy="createdTime desc",
                )
                .execute()
            )

            files = []
            for item in results.get("files", []):
                files.append(
                    DriveFile(
                        id=item["id"],
                        name=item["name"],
                        size=int(item.get("size", 0)),
                        mime_type=item["mimeType"],
                        created_time=datetime.fromisoformat(item["createdTime"].replace("Z", "+00:00")),
                        web_view_link=item.get("webViewLink"),
                        web_content_link=item.get("webContentLink"),
                        is_folder=item["mimeType"] == "application/vnd.google-apps.folder",
                    )
                )

            logger.info(f"Listed {len(files)} files from Drive folder {folder_id}")
            return files

        except HttpError as e:
            logger.error(f"Error listing files: {e}", exc_info=True)
            raise

    async def existing_files(self, folder_id: str) -> Dict[str, Dict]:
        """name -> {id, size, mime_type, is_folder} for a folder; {} on listing errors."""
        try:
            return {
                f.name: {"id": f.id, "size": f.size, "mime_type": f.mime_type, "is_folder": f.is_folder}
                for f in await self.list_files(folder_id=folder_id, page_size=1000)
            }
        except Exception as e:
            logger.warning(f"Error listing existing files: {e}")
            return {}

    async def get_or_create_folder(self, name: str, parent_id: str) -> str:
        key = f"{parent_id}:{name}"
        if key in self._folder_cache:
            return self._folder_cache[key]
        existing = (await self.existing_files(parent_id)).get(name)
        if existing and existing["is_folder"]:
            folder_id = existing["id"]
        else:
            logger.info(f"Creating new folder: {name}")
            folder_id = await with_retry(self.create_folder, name, parent_id=parent_id)
        self._folder_cache[key] = folder_id
        return folder_id

    async def create_folder(self, name: str, parent_id: Optional[str] = None) -> str:
        """Create a folder in Google Drive"""
        if not self.service:
            await self.authenticate()

        parent_id = parent_id or settings.google_drive.shared_folder_id

        file_metadata = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }

        try:
            folder = self.service.files().create(body=file_metadata, fields="id").execute()
            folder_id = folder.get("id")
            logger.info(f"Created folder '{name}' with ID: {folder_id}")
            return folder_id

        except HttpError as e:
            logger.error(f"Error creating folder: {e}", exc_info=True)
            raise

    async def upload_file(
        self,
        file_path: Path,
        parent_id: Optional[str] = None,
        resumable: bool = True,
    ) -> str:
        """
        Upload a file to Google Drive with resumable upload support
        Returns: file_id
        """
        if not self.service:
            await self.authenticate()

        parent_id = parent_id or settings.google_drive.shared_folder_id
        if not parent_id:
            raise ValueError("Google Drive folder ID not configured")

        file_metadata = {
            "name": file_path.name,
            "parents": [parent_id],
        }

        try:
            # Use resumable upload for large files
            media = MediaFileUpload(
                str(file_path),
                resumable=resumable,
                chunksize=settings.google_drive.chunk_size,
            )

            file = (
                self.service.files()
                .create(body=file_metadata, media_body=media, fields="id")
                .execute()
            )

            file_id = file.get("id")
            logger.info(f"Uploaded file '{file_path.name}' to Drive with ID: {file_id}")
            return file_id

        except HttpError as e:
            logger.error(f"Error uploading file: {e}", exc_info=True)
            raise

    async def delete_file(self, file_id: str):
        """Delete a file from Google Drive"""
        if not self.service:
            await self.authenticate()

        try:
            self.service.files().delete(fileId=file_id).execute()
            logger.info(f"Deleted file with ID: {file_id}")

        except HttpError as e:
            logger.error(f"Error deleting file: {e}", exc_info=True)
            raise

    async def get_file_metadata(self, file_id: str) -> DriveFile:
        """Get metadata for a specific file"""
        if not self.service:
            await self.authenticate()

        try:
            file = (
                self.service.files()
                .get(
                    fileId=file_id,
                    fields="id, name, size, mimeType, createdTime, webViewLink, webContentLink",
                )
                .execute()
            )

            return DriveFile(
                id=file["id"],
                name=file["name"],
                size=int(file.get("size", 0)),
                mime_type=file["mimeType"],
                created_time=datetime.fromisoformat(file["createdTime"].replace("Z", "+00:00")),
                web_view_link=file.get("webViewLink"),
                web_content_link=file.get("webContentLink"),
                is_folder=file["mimeType"] == "application/vnd.google-apps.folder",
            )

        except HttpError as e:
            logger.error(f"Error getting file metadata: {e}", exc_info=True)
            raise


async def with_retry(func, *args, **kwargs):
    """Await func with exponential backoff, settings.google_drive.max_retries attempts."""
    max_retries = settings.google_drive.max_retries
    delay = 1
    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            if attempt == max_retries - 1:
                logger.error(f"Failed after {max_retries} attempts")
                raise
            logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
            await asyncio.sleep(delay)
            delay *= 2


# Global client instance
_client: Optional[GoogleDriveClient] = None


async def get_drive_client() -> GoogleDriveClient:
    """Get global Google Drive client instance"""
    global _client
    if _client is None or _client.credentials is None:
        client = GoogleDriveClient()
        await client.authenticate()  # raises without a token; don't cache a credential-less client
        _client = client
    return _client


if __name__ == "__main__":
    # One-time login: python -m backend.drive.client  -> writes token_file
    logging.basicConfig(level=logging.INFO)
    asyncio.run(GoogleDriveClient().authenticate(interactive=True))
    print(f"Saved token to {settings.google_drive.token_file}")
