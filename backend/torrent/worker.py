import asyncio
import logging
from typing import Dict, Optional, Tuple
from datetime import datetime
from backend.models import TorrentState, TorrentProgress, TorrentInfo
from backend.database import get_db
from backend.torrent.engine import get_engine
from backend.config import settings

logger = logging.getLogger(__name__)

# Timeouts and thresholds
METADATA_TIMEOUT = 120  # seconds
STALL_TIMEOUT = 300  # 5 minutes of no progress = stalled
STALL_CHECK_INTERVAL = 30  # Check for stalls every 30 seconds


class DownloadTask:
    """Wrapper for active download with cancellation support"""
    def __init__(self, torrent_id: str, magnet_url: str, file_indices: Optional[list]):
        self.torrent_id = torrent_id
        self.magnet_url = magnet_url
        self.file_indices = file_indices
        self.cancel_event = asyncio.Event()
        self.task: Optional[asyncio.Task] = None
        self.last_progress = 0.0
        self.last_progress_time = datetime.utcnow()
        self.started_at = datetime.utcnow()


class TorrentWorker:
    """Manages concurrent torrent downloads with queue processing and stall detection"""

    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.queue: asyncio.Queue = asyncio.Queue()
        self.active_downloads: Dict[str, DownloadTask] = {}
        self.paused_torrents: Dict[str, Tuple[str, Optional[list]]] = {}  # torrent_id -> (magnet_url, file_indices)
        self.running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._progress_task: Optional[asyncio.Task] = None
        self._stall_check_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the worker"""
        if self.running:
            return

        self.running = True
        self._worker_task = asyncio.create_task(self._process_queue())
        self._progress_task = asyncio.create_task(self._update_progress())
        self._stall_check_task = asyncio.create_task(self._check_stalls())
        logger.info("Torrent worker started")

    async def stop(self):
        """Stop the worker"""
        if not self.running:
            return

        self.running = False

        # Cancel all active downloads
        for download in self.active_downloads.values():
            download.cancel_event.set()
            if download.task:
                download.task.cancel()

        if self._worker_task:
            self._worker_task.cancel()
        if self._progress_task:
            self._progress_task.cancel()
        if self._stall_check_task:
            self._stall_check_task.cancel()

        logger.info("Torrent worker stopped")

    async def add_download(self, torrent_id: str, magnet_url: str, file_indices: Optional[list] = None):
        """Add torrent to download queue"""
        await self.queue.put((torrent_id, magnet_url, file_indices))
        logger.info(f"Torrent {torrent_id} added to queue (queue size: {self.queue.qsize()})")

    async def pause_download(self, torrent_id: str) -> bool:
        """Pause an active download"""
        if torrent_id in self.active_downloads:
            download = self.active_downloads[torrent_id]
            # Store for resume
            self.paused_torrents[torrent_id] = (download.magnet_url, download.file_indices)
            # Signal cancellation
            download.cancel_event.set()
            logger.info(f"Signaled pause for torrent {torrent_id}")
            return True
        return False

    async def resume_download(self, torrent_id: str) -> bool:
        """Resume a paused download"""
        db = await get_db()
        torrent = await db.get_torrent(torrent_id)
        
        if not torrent:
            return False
            
        # Check if we have stored info from pause
        if torrent_id in self.paused_torrents:
            magnet_url, file_indices = self.paused_torrents[torrent_id]
            del self.paused_torrents[torrent_id]
        else:
            # Use torrent info from database
            magnet_url = torrent.magnet_url
            file_indices = None
            if torrent.metadata and torrent.metadata.files:
                file_indices = [f.index for f in torrent.metadata.files if f.selected]
        
        # Re-add to queue
        await self.queue.put((torrent_id, magnet_url, file_indices))
        logger.info(f"Torrent {torrent_id} re-queued for resume")
        return True

    async def cancel_download(self, torrent_id: str) -> bool:
        """Cancel an active download"""
        if torrent_id in self.active_downloads:
            download = self.active_downloads[torrent_id]
            download.cancel_event.set()
            if download.task:
                download.task.cancel()
            logger.info(f"Cancelled download for torrent {torrent_id}")
            return True
        
        # Remove from paused if present
        if torrent_id in self.paused_torrents:
            del self.paused_torrents[torrent_id]
            
        return False

    def get_active_count(self) -> int:
        """Get number of active downloads"""
        return len(self.active_downloads)

    def get_queue_size(self) -> int:
        """Get number of queued downloads"""
        return self.queue.qsize()

    async def _process_queue(self):
        """Process download queue with concurrency limit"""
        while self.running:
            try:
                # Cleanup completed tasks
                completed = [tid for tid, dl in self.active_downloads.items() 
                           if dl.task and dl.task.done()]
                for tid in completed:
                    del self.active_downloads[tid]

                # Wait for slot or queue item
                if len(self.active_downloads) >= self.max_concurrent:
                    await asyncio.sleep(1)
                    continue

                # Get next item from queue (non-blocking)
                try:
                    torrent_id, magnet_url, file_indices = await asyncio.wait_for(
                        self.queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                # Skip if already active
                if torrent_id in self.active_downloads:
                    continue

                # Create download task wrapper
                download = DownloadTask(torrent_id, magnet_url, file_indices)
                download.task = asyncio.create_task(
                    self._download_torrent(download)
                )
                self.active_downloads[torrent_id] = download

            except Exception as e:
                logger.error(f"Error in queue processing: {e}", exc_info=True)
                await asyncio.sleep(1)

    async def _download_torrent(self, download: DownloadTask):
        """Download a single torrent with cancellation and stall detection"""
        db = await get_db()
        engine = await get_engine()
        torrent_id = download.torrent_id

        try:
            logger.info(f"Starting download for torrent {torrent_id}")

            # Update state to downloading
            await db.update_torrent(torrent_id, state=TorrentState.DOWNLOADING)

            # Add to engine
            await engine.add_torrent(torrent_id, download.magnet_url, download.file_indices)

            if settings.torrent.stream_to_drive:
                from backend.drive.streamer import stream_torrent
                await stream_torrent(torrent_id, download.file_indices, download.cancel_event)
                return

            # Wait for completion with cancellation check
            while not engine.is_completed(torrent_id):
                # Check for cancellation
                if download.cancel_event.is_set():
                    logger.info(f"Download cancelled/paused for {torrent_id}")
                    await db.update_torrent(torrent_id, state=TorrentState.PAUSED)
                    return

                await asyncio.sleep(1)

            # Mark as completed
            await db.update_torrent(torrent_id, state=TorrentState.COMPLETED)
            logger.info(f"Torrent {torrent_id} completed successfully")

            # Trigger upload (will be handled by upload worker)
            from backend.drive.uploader import get_upload_worker
            upload_worker = await get_upload_worker()
            await upload_worker.add_upload(torrent_id)

        except asyncio.CancelledError:
            logger.info(f"Download task cancelled for torrent {torrent_id}")
            await db.update_torrent(torrent_id, state=TorrentState.PAUSED)
            raise

        except Exception as e:
            logger.error(f"Error downloading torrent {torrent_id}: {e}", exc_info=True)
            progress = TorrentProgress(
                torrent_id=torrent_id,
                state=TorrentState.ERROR,
                error=str(e),
            )
            await db.update_torrent(
                torrent_id,
                state=TorrentState.ERROR,
                progress=progress,
            )

        finally:
            # Cleanup
            if torrent_id in self.active_downloads:
                del self.active_downloads[torrent_id]

    async def _check_stalls(self):
        """Periodically check for stalled downloads"""
        while self.running:
            try:
                engine = await get_engine()
                db = await get_db()
                now = datetime.utcnow()

                for torrent_id, download in list(self.active_downloads.items()):
                    progress = await engine.get_progress(torrent_id)
                    
                    if not progress:
                        continue

                    # Check if progress has changed
                    if progress.progress > download.last_progress:
                        download.last_progress = progress.progress
                        download.last_progress_time = now
                    else:
                        # No progress - check stall timeout
                        stall_duration = (now - download.last_progress_time).total_seconds()
                        
                        if stall_duration > STALL_TIMEOUT and progress.download_rate == 0:
                            logger.warning(f"Torrent {torrent_id} stalled for {stall_duration:.0f}s with 0 speed")
                            
                            # Update progress with stall warning
                            progress.error = f"Stalled - no progress for {int(stall_duration)}s. Check peers/seeds."
                            await db.update_torrent(torrent_id, progress=progress)

                await asyncio.sleep(STALL_CHECK_INTERVAL)

            except Exception as e:
                logger.error(f"Error in stall check: {e}", exc_info=True)
                await asyncio.sleep(STALL_CHECK_INTERVAL)

    async def _update_progress(self):
        """Periodically update progress for all active downloads"""
        db = await get_db()
        engine = await get_engine()

        while self.running:
            try:
                for torrent_id, download in list(self.active_downloads.items()):
                    progress = await engine.get_progress(torrent_id)
                    if progress:
                        await db.update_torrent(torrent_id, progress=progress)
                        # Update last progress for stall detection
                        if progress.progress > download.last_progress:
                            download.last_progress = progress.progress
                            download.last_progress_time = datetime.utcnow()

                await asyncio.sleep(2)

            except Exception as e:
                logger.error(f"Error updating progress: {e}", exc_info=True)
                await asyncio.sleep(5)


# Global worker instance
_worker: Optional[TorrentWorker] = None


async def get_torrent_worker() -> TorrentWorker:
    """Get global torrent worker instance"""
    global _worker
    if _worker is None:
        _worker = TorrentWorker(max_concurrent=settings.torrent.max_concurrent_downloads)
        await _worker.start()
    return _worker
