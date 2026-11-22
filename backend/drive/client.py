import os
import logging
from pathlib import Path
from typing import Callable, Optional, List, Dict
import httplib2
import google_auth_httplib2
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
import asyncio
import hashlib
import json
import pickle
from backend.models import DriveFile
from backend.config import settings
from datetime import datetime

logger = logging.getLogger(__name__)

# Scopes required for Google Drive access
# Full Drive: the folder picker lists and uploads into the user's own folders (drive.file only saw app-made ones)
SCOPES = ["https://www.googleapis.com/auth/drive"]
FILE_FIELDS = "id, name, size, mimeType, md5Checksum, createdTime, webViewLink, webContentLink"
FOLDER_MIME = "application/vnd.google-apps.folder"
DRIVE_TIMEOUT = 30  # seconds per Drive metadata call


def to_drive_file(item: dict) -> DriveFile:
    return DriveFile(
        id=item["id"],
        name=item["name"],
        size=int(item.get("size", 0)),
        mime_type=item["mimeType"],
        md5_checksum=item.get("md5Checksum"),
        created_time=datetime.fromisoformat(item["createdTime"].replace("Z", "+00:00")),
        web_view_link=item.get("webViewLink"),
        web_content_link=item.get("webContentLink"),
        is_folder=item["mimeType"] == FOLDER_MIME,
    )


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

        if os.getenv("GOOGLE_AUTH") == "adc":
            # Google Colab: reuse the notebook login (google.colab.auth.authenticate_user), no OAuth client needed
            import google.auth
            self.credentials, _ = google.auth.default(scopes=SCOPES)
            self.service = build("drive", "v3", credentials=self.credentials)
            logger.info("Google Drive client authenticated with application default credentials")
            return

        self.credentials = load_token(token_file)
        if self.credentials and not self.credentials.has_scopes(SCOPES):
            # Token from before the switch to full Drive access; refreshing can't widen it
            self.credentials = None
            raise RuntimeError("Sign in again to let the app see all your Drive folders.")

        # Refresh or get new credentials
        if not self.credentials or not self.credentials.valid:
            if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                logger.info("Refreshing Google Drive credentials...")
                self.credentials.refresh(Request())
            else:
                if not interactive or not os.path.exists(creds_file):
                    # Never block a request on an interactive login (no browser/stdin in Docker)
                    raise RuntimeError("Google Drive is not connected. Sign in on the Settings page.")

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

            save_token(self.credentials, token_file)

        # Build service
        self.service = build("drive", "v3", credentials=self.credentials)
        logger.info("Google Drive client authenticated successfully")

    async def account(self) -> Optional[str]:
        """Signed-in user's email, if Google shares it with this scope."""
        try:
            about = await self._run(self.service.about().get(fields="user(emailAddress, displayName)"))
            user = about.get("user", {})
            return user.get("emailAddress") or user.get("displayName")
        except Exception as e:
            logger.debug(f"about.get failed: {e}")
            return None

    def _http(self, timeout=DRIVE_TIMEOUT):
        # Own connection per call: httplib2 is not thread-safe, and a stale shared socket hung for 60s+.
        return google_auth_httplib2.AuthorizedHttp(self.credentials, http=httplib2.Http(timeout=timeout))

    async def _run(self, request):
        """Execute a Drive API request off the event loop, so a slow call doesn't freeze the whole app."""
        return await asyncio.to_thread(request.execute, http=self._http())

    async def list_files(self, folder_id: Optional[str] = None, page_size: int = 100,
                         all_pages: bool = False, folders_only: bool = False) -> List[DriveFile]:
        """List files in the specified folder or shared folder"""
        if not self.service:
            await self.authenticate()

        folder_id = folder_id or settings.google_drive.shared_folder_id
        if not folder_id:
            raise ValueError("Google Drive folder ID not configured")

        try:
            query = f"'{folder_id}' in parents and trashed=false"
            if folders_only:
                query += f" and mimeType='{FOLDER_MIME}'"
            items, token = [], None
            while True:
                results = await self._run(
                    self.service.files()
                    .list(
                        q=query,
                        pageSize=page_size,
                        pageToken=token,
                        fields=f"nextPageToken, files({FILE_FIELDS})",
                        orderBy="folder,name" if folders_only else "createdTime desc",
                    )
                )
                items += results.get("files", [])
                token = results.get("nextPageToken")
                if not (all_pages and token):
                    break

            files = [to_drive_file(item) for item in items]

            logger.info(f"Listed {len(files)} files from Drive folder {folder_id}")
            return files

        except HttpError as e:
            logger.error(f"Error listing files: {e}", exc_info=True)
            raise

    async def existing_files(self, folder_id: str) -> Dict[str, Dict]:
        """name -> {id, size, mime_type, is_folder} for a folder; {} on listing errors."""
        try:
            return {
                f.name: {"id": f.id, "size": f.size, "mime_type": f.mime_type, "is_folder": f.is_folder,
                         "md5": f.md5_checksum}
                for f in await self.list_files(folder_id=folder_id, page_size=1000, all_pages=True)
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
            "mimeType": FOLDER_MIME,
            "parents": [parent_id],
        }

        try:
            folder = await self._run(self.service.files().create(body=file_metadata, fields="id"))
            folder_id = folder.get("id")
            logger.info(f"Created folder '{name}' with ID: {folder_id}")
            return folder_id

        except HttpError as e:
            logger.error(f"Error creating folder: {e}", exc_info=True)
            if e.resp.status == 404:
                raise RuntimeError("Upload folder not found on Drive (deleted, or in another Google account). "
                                   "Pick a folder in Settings → Drive upload, then Retry.") from e
            raise

    async def upload_file(
        self,
        file_path: Path,
        parent_id: Optional[str] = None,
        resumable: bool = True,
        on_progress: Optional[Callable[[int], None]] = None,
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

        def upload_blocking():
            # Own http per upload: httplib2 is not thread-safe, and this runs off the event loop.
            http = self._http(timeout=None)  # sendall timeout covers a whole chunk; slow links need longer
            media = MediaFileUpload(str(file_path), resumable=resumable, chunksize=settings.google_drive.chunk_size)
            request = self.service.files().create(body=file_metadata, media_body=media, fields="id, md5Checksum")
            response = None
            while response is None:
                status, response = request.next_chunk(http=http)
                if status and on_progress:
                    on_progress(status.resumable_progress)
            return response

        try:
            file = await asyncio.to_thread(upload_blocking)
            file_id = file.get("id")
            local_md5 = await asyncio.to_thread(file_md5, file_path)
            if file.get("md5Checksum") != local_md5:
                await self.delete_file(file_id)  # don't leave a corrupt copy that later runs would skip as "exists"
                raise ValueError(f"Checksum mismatch after uploading '{file_path.name}' "
                                 f"(local {local_md5}, Drive {file.get('md5Checksum')}); removed it from Drive")
            logger.info(f"Uploaded and verified '{file_path.name}' (md5 {local_md5}), Drive ID: {file_id}")
            return file_id

        except HttpError as e:
            logger.error(f"Error uploading file: {e}", exc_info=True)
            raise

    async def delete_file(self, file_id: str):
        """Delete a file from Google Drive"""
        if not self.service:
            await self.authenticate()

        try:
            await self._run(self.service.files().delete(fileId=file_id))
            logger.info(f"Deleted file with ID: {file_id}")

        except HttpError as e:
            logger.error(f"Error deleting file: {e}", exc_info=True)
            raise

    async def get_file_metadata(self, file_id: str) -> DriveFile:
        """Get metadata for a specific file"""
        if not self.service:
            await self.authenticate()

        try:
            file = await self._run(self.service.files().get(fileId=file_id, fields=FILE_FIELDS))
            return to_drive_file(file)

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
            if attempt == max_retries - 1 or isinstance(e, RuntimeError):  # RuntimeError = permanent, retry won't help
                logger.error(f"Failed after {max_retries} attempts")
                raise
            logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
            await asyncio.sleep(delay)
            delay *= 2


def file_md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        while chunk := f.read(8 * 1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def load_token(token_file: str) -> Optional[Credentials]:
    """JSON token (current format); falls back to the old pickle format and converts it."""
    if not os.path.exists(token_file):
        return None
    try:
        return Credentials.from_authorized_user_file(token_file)  # keep the scopes the token was granted
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        with open(token_file, "rb") as f:
            creds = pickle.load(f)  # legacy token written by older versions of this app
        save_token(creds, token_file)
        return creds


def write_private(path: str, text: str):
    """Write a secret file readable only by this user (token, OAuth client)."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        f.write(text)
    os.chmod(path, 0o600)  # O_CREAT's mode only applies to new files


def save_token(creds: Credentials, token_file: str):
    write_private(token_file, creds.to_json())


# Global client instance
_client: Optional[GoogleDriveClient] = None


def reset_drive_client():
    """Forget the cached client, e.g. after signing in or out."""
    global _client
    _client = None


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
