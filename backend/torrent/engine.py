import libtorrent as lt
import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict, List, Callable
from datetime import datetime
from backend.models import (
    TorrentMetadata,
    TorrentProgress,
    TorrentState,
    FileInfo,
)
from backend.config import settings

logger = logging.getLogger(__name__)


class TorrentEngine:
    """High-performance torrent engine using libtorrent"""

    def __init__(self):
        self.session: Optional[lt.session] = None
        self.handles: Dict[str, lt.torrent_handle] = {}
        self.running = False
        self._progress_callbacks: Dict[str, List[Callable]] = {}

    async def start(self):
        """Initialize libtorrent session"""
        if self.running:
            return

        logger.info("Starting torrent engine...")

        # Create session with optimal settings
        self.session = lt.session()

        # Configure session settings
        settings_pack = {
            "listen_interfaces": f"0.0.0.0:{settings.torrent.listen_ports[0]}",
            "enable_dht": True,
            "enable_lsd": True,
            "enable_upnp": True,
            "enable_natpmp": True,
            "announce_to_all_tiers": True,
            "announce_to_all_trackers": True,
        }

        self.session.apply_settings(settings_pack)
        self.apply_limits()

        # Add DHT routers
        self.session.add_dht_router("router.bittorrent.com", 6881)
        self.session.add_dht_router("router.utorrent.com", 6881)
        self.session.add_dht_router("dht.transmissionbt.com", 6881)

        self.running = True
        logger.info("Torrent engine started successfully")

    def apply_limits(self):
        """Push the runtime-editable limits from settings into the live session."""
        if self.session:
            self.session.apply_settings({
                "connections_limit": settings.torrent.max_connections,
                "upload_rate_limit": settings.torrent.upload_rate_limit,
                "download_rate_limit": settings.torrent.download_rate_limit,
            })

    async def stop(self):
        """Stop torrent engine and cleanup"""
        if not self.running:
            return

        logger.info("Stopping torrent engine...")

        # Pause all torrents
        for handle in self.handles.values():
            if handle.is_valid():
                handle.pause()

        # Save resume data
        for info_hash, handle in self.handles.items():
            if handle.is_valid():
                handle.save_resume_data()

        self.handles.clear()
        self.session = None
        self.running = False
        logger.info("Torrent engine stopped")

    def _parse_magnet(self, magnet_url: str):
        params = lt.parse_magnet_uri(magnet_url)
        params.trackers = list(dict.fromkeys([*params.trackers, *settings.torrent.extra_trackers]))
        return params

    async def fetch_metadata(self, magnet_url: str, timeout: int = 60) -> TorrentMetadata:
        """
        Fetch torrent metadata from magnet link without downloading
        Returns: TorrentMetadata with file information
        """
        if not self.running:
            await self.start()

        logger.info(f"Fetching metadata for magnet link...")

        # Parse magnet link
        params = self._parse_magnet(magnet_url)
        params.save_path = "/tmp"  # Temporary path, won't download yet
        params.flags = lt.torrent_flags.upload_mode  # Metadata only

        # Add torrent
        handle = self.session.add_torrent(params)

        # Wait for metadata
        start_time = asyncio.get_event_loop().time()
        while not handle.has_metadata():
            if asyncio.get_event_loop().time() - start_time > timeout:
                self.session.remove_torrent(handle)
                raise TimeoutError("Metadata fetch timed out")

            await asyncio.sleep(0.1)

        # Extract metadata
        info = handle.torrent_file()
        info_hash = str(handle.info_hash())

        # Build file list
        files = []
        fs = info.files()
        for i in range(fs.num_files()):
            f = fs.at(i)
            files.append(
                FileInfo(
                    index=i,
                    path=f.path,
                    size=f.size,
                    selected=False,
                )
            )

        # Extract trackers
        trackers = []
        for t in handle.trackers():
            if isinstance(t, dict):
                trackers.append(t.get('url', ''))
            else:
                trackers.append(t.url if hasattr(t, 'url') else str(t))

        # Remove temporary torrent
        self.session.remove_torrent(handle)

        metadata = TorrentMetadata(
            name=info.name(),
            total_size=info.total_size(),
            num_files=fs.num_files(),
            files=files,
            info_hash=info_hash,
            trackers=trackers,
            comment=info.comment() if info.comment() else None,
            creation_date=info.creation_date() if info.creation_date() else None,
        )

        logger.info(f"Metadata fetched: {metadata.name} ({metadata.num_files} files)")
        return metadata

    async def add_torrent(
        self,
        torrent_id: str,
        magnet_url: str,
        file_indices: Optional[List[int]] = None,
        timeout: int = 120,
    ) -> str:
        """
        Add torrent for downloading
        Returns: info_hash
        """
        if not self.running:
            await self.start()

        logger.info(f"Adding torrent {torrent_id} for download...")

        # Create download directory
        download_path = Path(settings.torrent.download_path) / torrent_id
        download_path.mkdir(parents=True, exist_ok=True)

        # Parse magnet
        params = self._parse_magnet(magnet_url)
        params.save_path = str(download_path)

        # Add torrent
        handle = self.session.add_torrent(params)

        # Wait for metadata with timeout
        start_time = asyncio.get_event_loop().time()
        while not handle.has_metadata():
            if asyncio.get_event_loop().time() - start_time > timeout:
                self.session.remove_torrent(handle)
                raise TimeoutError(f"Metadata fetch timed out after {timeout}s")
            await asyncio.sleep(0.1)

        # Set file priorities (0 = don't download, 4 = normal)
        if file_indices is not None:
            info = handle.torrent_file()
            fs = info.files()
            for i in range(fs.num_files()):
                priority = 4 if i in file_indices else 0
                handle.file_priority(i, priority)

        info_hash = str(handle.info_hash())
        self.handles[torrent_id] = handle

        logger.info(f"Torrent added: {info_hash}")
        return info_hash

    async def get_progress(self, torrent_id: str) -> Optional[TorrentProgress]:
        """Get torrent download progress"""
        handle = self.handles.get(torrent_id)
        if not handle or not handle.is_valid():
            return None

        status = handle.status()

        # Determine state
        if status.paused:
            state = TorrentState.PAUSED
        elif status.state == lt.torrent_status.checking_files:
            state = TorrentState.DOWNLOADING
        elif status.state == lt.torrent_status.downloading:
            state = TorrentState.DOWNLOADING
        elif status.state == lt.torrent_status.seeding:
            state = TorrentState.COMPLETED
        else:
            state = TorrentState.DOWNLOADING

        # Calculate ETA
        eta = None
        if status.download_rate > 0:
            remaining = status.total_wanted - status.total_wanted_done
            eta = int(remaining / status.download_rate)

        return TorrentProgress(
            torrent_id=torrent_id,
            state=state,
            progress=status.progress * 100,
            download_rate=status.download_rate,
            upload_rate=status.upload_rate,
            num_peers=status.num_peers,
            num_seeds=status.num_seeds,
            downloaded=status.total_wanted_done,
            total_size=status.total_wanted,
            eta=eta,
        )

    async def pause_torrent(self, torrent_id: str) -> bool:
        """Pause torrent download"""
        handle = self.handles.get(torrent_id)
        if handle and handle.is_valid():
            handle.pause()
            logger.info(f"Torrent {torrent_id} paused")
            return True
        return False

    async def resume_torrent(self, torrent_id: str) -> bool:
        """Resume torrent download"""
        handle = self.handles.get(torrent_id)
        if handle and handle.is_valid():
            handle.resume()
            logger.info(f"Torrent {torrent_id} resumed")
            return True
        return False

    async def remove_torrent(self, torrent_id: str, delete_files: bool = False) -> bool:
        """Remove torrent from engine"""
        handle = self.handles.get(torrent_id)
        if handle and handle.is_valid():
            flags = lt.session.delete_files if delete_files else 0  # 2.0 python binding exposes the flag on session
            self.session.remove_torrent(handle, flags)
            del self.handles[torrent_id]
            logger.info(f"Torrent {torrent_id} removed")
            return True
        return False

    def is_completed(self, torrent_id: str) -> bool:
        """Check if torrent download is completed"""
        handle = self.handles.get(torrent_id)
        if handle and handle.is_valid():
            status = handle.status()
            return status.is_seeding or status.progress >= 1.0
        return False

    def get_download_path(self, torrent_id: str) -> Optional[Path]:
        """Get download path for completed torrent"""
        handle = self.handles.get(torrent_id)
        if handle and handle.is_valid():
            return Path(handle.status().save_path)
        return Path(settings.torrent.download_path) / torrent_id

    async def get_session_stats(self) -> dict:
        """Get aggregate session statistics"""
        if not self.session:
            return {
                "total_download_rate": 0,
                "total_upload_rate": 0,
                "active_torrents": 0,
                "total_peers": 0,
                "total_seeds": 0,
            }
        
        total_download = 0
        total_upload = 0
        total_peers = 0
        total_seeds = 0
        active_count = 0
        
        for handle in self.handles.values():
            if handle.is_valid():
                status = handle.status()
                if not status.paused:
                    total_download += status.download_rate
                    total_upload += status.upload_rate
                    total_peers += status.num_peers
                    total_seeds += status.num_seeds
                    if status.state in [lt.torrent_status.downloading, lt.torrent_status.downloading_metadata]:
                        active_count += 1
        
        return {
            "total_download_rate": total_download,
            "total_upload_rate": total_upload,
            "active_torrents": active_count,
            "total_peers": total_peers,
            "total_seeds": total_seeds,
        }


# Global engine instance
engine: Optional[TorrentEngine] = None


async def get_engine() -> TorrentEngine:
    """Get torrent engine instance"""
    global engine
    if engine is None:
        engine = TorrentEngine()
        await engine.start()
    return engine
