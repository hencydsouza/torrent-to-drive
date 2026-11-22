import os
import yaml
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False


class TorrentConfig(BaseModel):
    download_path: str = "./data/torrents"
    listen_ports: list[int] = [6881, 6891]
    max_connections: int = 200
    max_uploads: int = 50
    upload_rate_limit: int = 0
    download_rate_limit: int = 0
    max_concurrent_downloads: int = 5
    stream_to_drive: bool = False  # sequential download -> chunked Drive upload -> free local bytes
    stream_buffer_mb: int = 2048  # max torrent bytes kept on disk ahead of the upload cursor
    extra_trackers: list[str] = []  # appended to every new torrent (like qBittorrent's tracker list)


class GoogleDriveConfig(BaseModel):
    credentials_file: str = "./config/credentials.json"
    token_file: str = "./config/token.json"
    shared_folder_id: str = "root"  # Drive folder ID; "root" = My Drive
    chunk_size: int = 10485760
    max_retries: int = 5


class DatabaseConfig(BaseModel):
    path: str = "./data/torrents.db"


class LoggingConfig(BaseModel):
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


# (section, key) -> env var that overrides it; the settings API refuses to edit these while set
ENV_OVERRIDES = {
    ("torrent", "stream_to_drive"): "STREAM_TO_DRIVE",
    ("torrent", "stream_buffer_mb"): "STREAM_BUFFER_MB",
}


def env_override(env: str) -> Optional[str]:
    return os.getenv(env) or None  # empty (e.g. compose's ${VAR:-}) counts as unset


class Settings(BaseModel):
    server: ServerConfig = Field(default_factory=ServerConfig)
    torrent: TorrentConfig = Field(default_factory=TorrentConfig)
    google_drive: GoogleDriveConfig = Field(default_factory=GoogleDriveConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)

    @classmethod
    def load(cls, config_path: str = "./config/settings.yaml") -> "Settings":
        """Load settings from YAML file with environment variable overrides"""
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                data = yaml.safe_load(f) or {}
        else:
            data = {}

        # Older setups set the folder in .env; it now only fills in when the app hasn't saved one.
        if (folder := env_override("DRIVE_FOLDER_ID")) and not data.get("google_drive", {}).get("shared_folder_id"):
            data.setdefault("google_drive", {})["shared_folder_id"] = folder

        for (section, key), env in ENV_OVERRIDES.items():
            if (raw := env_override(env)) is not None:
                data.setdefault(section, {})[key] = raw  # pydantic parses "true"/"1"/"2048"

        return cls(**data)


# Global settings instance
settings = Settings.load()
