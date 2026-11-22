from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List


class TorrentState(str, Enum):
    FETCHING_METADATA = "fetching_metadata"
    METADATA_READY = "metadata_ready"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    ERROR = "error"
    PAUSED = "paused"


class FileInfo(BaseModel):
    index: int
    path: str
    size: int
    selected: bool = False


class FileProgress(FileInfo):
    downloaded: int = 0
    uploaded: int = 0  # bytes of this file already on Drive
    verified: bool = False  # Drive's MD5 matched the local file after upload


class TorrentMetadata(BaseModel):
    name: str
    total_size: int
    num_files: int
    files: List[FileInfo]
    info_hash: str
    trackers: List[str] = []
    comment: Optional[str] = None
    creation_date: Optional[int] = None


class TorrentProgress(BaseModel):
    torrent_id: str
    state: TorrentState
    progress: float = 0.0  # 0-100
    download_rate: int = 0  # bytes/sec
    upload_rate: int = 0  # bytes/sec
    num_peers: int = 0
    num_seeds: int = 0
    downloaded: int = 0
    total_size: int = 0
    uploaded: int = 0  # bytes already on Drive
    eta: Optional[int] = None  # seconds
    error: Optional[str] = None


class TorrentRequest(BaseModel):
    magnet_url: str


class TorrentDownloadRequest(BaseModel):
    torrent_id: str
    file_indices: Optional[List[int]] = None  # None = all files


class DriveFile(BaseModel):
    id: str
    name: str
    size: int
    mime_type: str
    md5_checksum: Optional[str] = None
    created_time: datetime
    web_view_link: Optional[str] = None
    web_content_link: Optional[str] = None
    is_folder: bool = False


class TorrentInfo(BaseModel):
    id: str
    magnet_url: str
    state: TorrentState
    metadata: Optional[TorrentMetadata] = None
    progress: Optional[TorrentProgress] = None
    created_at: datetime
    updated_at: datetime
    drive_file_id: Optional[str] = None


class ServerStats(BaseModel):
    total_download_rate: int = 0
    total_upload_rate: int = 0
    active_torrents: int = 0
    total_peers: int = 0
    total_seeds: int = 0
    queued_torrents: int = 0


class DriveHealth(BaseModel):
    status: str  # "healthy" | "unhealthy"
    service: str
    error: Optional[str] = None


class AppSettings(BaseModel):
    stream_to_drive: bool
    stream_buffer_mb: int
    max_concurrent_downloads: int
    max_connections: int
    download_rate_limit: int
    upload_rate_limit: int
    chunk_size: int
    max_retries: int
    extra_trackers: List[str] = []
    shared_folder_id: str
    env_locked: List[str] = []


class AuthStatus(BaseModel):
    mode: str  # "oauth" (own OAuth client) | "adc" (Colab login)
    has_client: bool  # OAuth client JSON uploaded
    connected: bool
    account: Optional[str] = None
    redirect_uri: Optional[str] = None  # add this to a Web-type OAuth client
    error: Optional[str] = None


class PeerInfo(BaseModel):
    address: str
    client: str
    progress: float  # 0-100
    download_rate: int
    upload_rate: int
    seed: bool


class TrackerInfo(BaseModel):
    url: str
    tier: int
    status: str  # "working" | "error" | "updating" | "not contacted"
    message: Optional[str] = None
    peers: Optional[int] = None


class TorrentDetails(BaseModel):
    progress: TorrentProgress
    info_hash: str
    save_path: str
    piece_size: int
    pieces: str  # one char per piece: h=have, d=downloading, w=wanted, s=skipped
    availability: float  # distributed copies among connected peers
    all_time_download: int
    all_time_upload: int
    wasted: int  # bytes that failed hash checks or arrived twice
    active_seconds: int
    sequential: bool
    connections: int
    peers: List[PeerInfo]
    trackers: List[TrackerInfo]

