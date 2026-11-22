"""Stream-to-Drive: download sequentially inside a bounded window, upload each
contiguous chunk with a Drive resumable session, then free the local bytes.

Peak local disk ~= stream_buffer_mb (plus filesystem slack), not torrent size.
"""
import asyncio
import ctypes
import hashlib
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

import libtorrent as lt
from google.auth.transport.requests import AuthorizedSession

from backend.config import settings
from backend.database import get_db
from backend.models import TorrentState
from backend.drive.client import with_retry

logger = logging.getLogger(__name__)

UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,md5Checksum"
DRIVE_ALIGN = 256 * 1024  # Drive resumable chunks must be multiples of 256 KiB

try:
    _libc = ctypes.CDLL(None, use_errno=True)
    _fallocate = _libc.fallocate
    _fallocate.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int64, ctypes.c_int64]
except (OSError, AttributeError):
    _fallocate = None  # non-Linux (e.g. native macOS): bytes are only freed when the file finishes


def punch_hole(path: Path, length: int) -> bool:
    """Free disk blocks for bytes [0, length) without changing file size. Linux only."""
    if not _fallocate or length <= 0:
        return False
    fd = os.open(path, os.O_RDWR)
    try:
        # FALLOC_FL_KEEP_SIZE | FALLOC_FL_PUNCH_HOLE
        return _fallocate(fd, 0x01 | 0x02, 0, length) == 0
    finally:
        os.close(fd)


def parse_committed(range_header: Optional[str]) -> int:
    """Drive 308 'Range: bytes=0-N' -> N+1 bytes committed; no header -> 0."""
    if not range_header:
        return 0
    return int(range_header.rsplit("-", 1)[1]) + 1


class StreamState:
    """Per-torrent resume state, kept next to the download so restarts can continue."""

    def __init__(self, path: Path):
        self.path = path
        self.data = json.loads(path.read_text()) if path.exists() else {}

    def file(self, idx: int) -> dict:
        return self.data.setdefault(str(idx), {"session": None, "committed": 0, "done": False})

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data))
        tmp.replace(self.path)


class TorrentStreamer:
    def __init__(self, torrent_id: str, handle: lt.torrent_handle, download_path: Path,
                 file_indices: Optional[list], cancel_event: asyncio.Event, uploaded: Optional[dict] = None,
                 file_uploaded: Optional[dict] = None, file_verified: Optional[set] = None):
        self.torrent_id = torrent_id
        self.uploaded = uploaded if uploaded is not None else {}  # shared torrent_id -> bytes on Drive
        self.file_uploaded = file_uploaded if file_uploaded is not None else {}  # shared local path -> bytes
        self.file_verified = file_verified if file_verified is not None else set()  # shared local paths
        self.handle = handle
        self.download_path = download_path
        self.cancel_event = cancel_event
        self.info = handle.torrent_file()
        self.fs = self.info.files()
        n = self.fs.num_files()
        self.selected = sorted(file_indices) if file_indices is not None else list(range(n))
        self.state = StreamState(download_path / ".stream.json")
        self._load_limits()

    def _report_uploaded(self):
        for i in self.selected:
            st = self.state.file(i)
            self.file_uploaded[str(self.download_path / self.fs.file_path(i))] = \
                self.fs.file_size(i) if st["done"] else st["committed"]
        self.uploaded[self.torrent_id] = sum(
            self.file_uploaded[str(self.download_path / self.fs.file_path(i))] for i in self.selected)

    def _load_limits(self):
        """Re-read buffer/chunk from settings so edits on the Settings page apply to the next chunk."""
        self.buffer = settings.torrent.stream_buffer_mb * 1024 * 1024
        self.chunk = max(DRIVE_ALIGN, settings.google_drive.chunk_size // DRIVE_ALIGN * DRIVE_ALIGN)

    # ---------- piece window ----------

    def _set_window(self, cursor: int):
        """Want only pieces that overlap a selected file and [cursor, cursor + buffer)."""
        plen = self.info.piece_length()
        end = cursor + max(self.buffer, self.chunk)  # window must cover a whole upload chunk or it never fills
        wanted = [False] * self.info.num_pieces()
        for idx in self.selected:
            if self.state.file(idx)["done"] or self.fs.file_size(idx) == 0:
                continue
            f_start = self.fs.file_offset(idx)
            f_end = f_start + self.fs.file_size(idx)
            lo, hi = max(f_start, cursor), min(f_end, end)
            if lo < hi:
                for p in range(lo // plen, (hi - 1) // plen + 1):
                    wanted[p] = True
        self.handle.prioritize_pieces([4 if w else 0 for w in wanted])

    def _range_ready(self, idx: int, offset: int, size: int) -> bool:
        plen, base = self.info.piece_length(), self.fs.file_offset(idx)
        first, last = (base + offset) // plen, (base + offset + size - 1) // plen
        return all(self.handle.have_piece(p) for p in range(first, last + 1))

    # ---------- Drive HTTP ----------

    async def _http(self, method: str, url: str, **kw):
        return await asyncio.to_thread(self.http.request, method, url, timeout=120, **kw)

    async def _new_session(self, name: str, parent_id: str, size: int) -> str:
        r = await self._http("POST", UPLOAD_URL,
                             json={"name": name, "parents": [parent_id]},
                             headers={"X-Upload-Content-Length": str(size)})
        r.raise_for_status()
        return r.headers["Location"]

    async def _query(self, session: str, size: int):
        """Returns committed bytes, or None if the session is gone (expired)."""
        r = await self._http("PUT", session, headers={"Content-Range": f"bytes */{size}"})
        if r.status_code in (200, 201):
            return size
        if r.status_code == 308:
            return parse_committed(r.headers.get("Range"))
        if r.status_code in (404, 410):
            return None
        r.raise_for_status()

    # ---------- main ----------

    async def run(self, drive):
        db = await get_db()
        self.http = AuthorizedSession(drive.credentials)
        await db.update_torrent(self.torrent_id, state=TorrentState.UPLOADING)

        # Fetch in order; never unchoke peers: freed (hole-punched) pieces would serve zeros. A 1 B/s upload cap
        # instead also throttles our outgoing piece requests and drops download ~40x.
        self.handle.set_max_uploads(0)
        self.handle.set_flags(lt.torrent_flags.sequential_download)

        root_id = await drive.get_or_create_folder(self.info.name(),
                                                       settings.google_drive.shared_folder_id)
        multi = self.fs.num_files() > 1
        self._report_uploaded()  # resumed streams start from what .stream.json says is already on Drive

        for idx in self.selected:
            st = self.state.file(idx)
            if st["done"]:
                continue
            size = self.fs.file_size(idx)
            rel = Path(self.fs.file_path(idx))
            parts = rel.parts[1:] if multi else rel.parts  # multi-file paths start with the torrent name

            parent = root_id
            for folder in parts[:-1]:
                parent = await drive.get_or_create_folder(folder, parent)

            existing = await drive.existing_files(parent)
            hit = existing.get(parts[-1])
            if hit and not hit["is_folder"] and hit["size"] == size:
                logger.info(f"[stream] exists on Drive, skipping: {rel}")
            elif size == 0:
                await with_retry(self._empty_file, parts[-1], parent)
            else:
                await self._stream_file(idx, size, parts[-1], parent, st)

            st["done"] = True
            self.state.save()
            self._report_uploaded()
            local = self.download_path / rel
            if local.exists():
                local.unlink()

        await db.update_torrent(self.torrent_id, state=TorrentState.UPLOADED, drive_file_id=root_id)
        logger.info(f"[stream] torrent {self.torrent_id} fully streamed to Drive")

    async def _wait_recheck(self, timeout: float = 10):
        """force_recheck is async; stale have_piece() would let us upload hole-punched zeros."""
        checking = (lt.torrent_status.checking_files, lt.torrent_status.checking_resume_data)
        loop = asyncio.get_running_loop()
        started = loop.time()
        seen = False
        while True:
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()
            if loop.time() - started > 600:
                raise RuntimeError("recheck never started; refusing to stream unverified pieces")
            st = self.handle.status()
            if st.state in checking:
                seen = True
            elif seen or (loop.time() - started > timeout and not st.paused):
                return
            await asyncio.sleep(0.5)

    async def _empty_file(self, name: str, parent: str):
        r = await self._http("POST", "https://www.googleapis.com/drive/v3/files",
                             json={"name": name, "parents": [parent]})
        r.raise_for_status()

    async def _stream_file(self, idx: int, size: int, name: str, parent: str, st: dict):
        local = self.download_path / self.fs.file_path(idx)
        f_start = self.fs.file_offset(idx)
        failures = 0

        if st["session"]:
            committed = await self._query(st["session"], size)
            if committed is None:
                logger.warning(f"[stream] Drive session expired for {name}; re-downloading file from 0")
                st.update(session=None, committed=0)
                self.handle.force_recheck()  # freed pieces fail the hash and get fetched again
                await self._wait_recheck()
            else:
                st["committed"] = committed
        if not st["session"]:
            st["session"] = await self._new_session(name, parent, size)
            st["committed"] = 0
        self.state.save()

        # MD5 of what Drive has committed, compared with Drive's md5Checksum at the end. Only possible when
        # this run uploaded the file from byte 0 (hash state isn't saved across restarts).
        md5, hashed = (hashlib.md5(), 0) if st["committed"] == 0 else (None, 0)
        final = None

        while st["committed"] < size:
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()

            offset = st["committed"]
            self._load_limits()  # chunk stays a 256 KiB multiple, so a mid-file change is valid for Drive
            n = min(self.chunk, size - offset)
            self._set_window(f_start + offset)
            if not self._range_ready(idx, offset, n):
                await asyncio.sleep(1)
                continue

            data = await asyncio.to_thread(_read, local, offset, n)
            try:
                r = await self._http("PUT", st["session"], data=data, headers={
                    "Content-Length": str(n),
                    "Content-Range": f"bytes {offset}-{offset + n - 1}/{size}",
                })
                if r.status_code in (200, 201):
                    st["committed"] = size
                    final = r.json()
                elif r.status_code == 308:
                    st["committed"] = parse_committed(r.headers.get("Range"))
                else:
                    r.raise_for_status()
                failures = 0
                if md5 and hashed == offset and st["committed"] >= offset:
                    md5.update(data[:st["committed"] - offset])
                    hashed = st["committed"]
            except Exception as e:
                failures += 1
                if failures > settings.google_drive.max_retries:
                    raise
                logger.warning(f"[stream] chunk @{offset} of {name} failed ({e}); resyncing")
                await asyncio.sleep(2 ** failures)
                try:
                    committed = await self._query(st["session"], size)
                except Exception as qe:  # network still down: retry the chunk, don't fail the torrent
                    logger.warning(f"[stream] resync of {name} failed ({qe}); will retry")
                    continue
                if committed is None:
                    raise RuntimeError(f"Drive session for {name} expired mid-upload")
                st["committed"] = committed
                if md5 and committed != hashed:
                    md5 = None  # Drive's view moved away from what we hashed; can't verify this file

            self.state.save()
            self._report_uploaded()
            if not punch_hole(local, st["committed"]) and st["committed"] < size:
                logger.debug("[stream] hole punching unavailable; space freed when file completes")

        remote = (final or {}).get("md5Checksum")
        if md5 and remote:
            if md5.hexdigest() != remote:
                # Delete it so a retry re-uploads instead of skipping a same-size corrupt copy
                await self._http("DELETE", f"https://www.googleapis.com/drive/v3/files/{final['id']}")
                st.update(session=None, committed=0)
                self.state.save()
                raise RuntimeError(f"Checksum mismatch after streaming {name} (local {md5.hexdigest()}, Drive {remote})")
            self.file_verified.add(str(local))
            logger.info(f"[stream] uploaded and verified {name} ({size} bytes, md5 {remote})")
        else:
            logger.info(f"[stream] uploaded {name} ({size} bytes; pieces SHA-checked, MD5 not compared after resume)")


def _read(path: Path, offset: int, n: int) -> bytes:
    with open(path, "rb") as f:
        f.seek(offset)
        return f.read(n)


async def stream_torrent(torrent_id: str, file_indices: Optional[list], cancel_event: asyncio.Event):
    from backend.drive.client import get_drive_client
    from backend.torrent import get_engine

    engine = await get_engine()
    drive = await get_drive_client()
    download_path = engine.get_download_path(torrent_id)

    await TorrentStreamer(torrent_id, engine.handles[torrent_id], download_path,
                          file_indices, cancel_event, engine.uploaded, engine.file_uploaded,
                          engine.file_verified).run(drive)

    await engine.remove_torrent(torrent_id)
    shutil.rmtree(download_path, ignore_errors=True)
