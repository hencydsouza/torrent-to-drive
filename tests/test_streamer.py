"""Self-check for stream-to-Drive helpers. Run: python -m tests.test_streamer (needs libtorrent; punch test Linux only)."""
import asyncio
import os
import tempfile
from pathlib import Path

import libtorrent as lt

from backend.drive.streamer import TorrentStreamer, parse_committed, punch_hole


class FakeHandle:
    def __init__(self, info):
        self.info, self.prios, self.have = info, None, set()

    def torrent_file(self):
        return self.info

    def prioritize_pieces(self, p):
        self.prios = p

    def have_piece(self, p):
        return p in self.have


def make_torrent(root: Path) -> lt.torrent_info:
    (root / "t").mkdir()
    (root / "t" / "a.bin").write_bytes(os.urandom(48 * 1024))   # 3 pieces @16K
    (root / "t" / "b.bin").write_bytes(os.urandom(40 * 1024))   # spans pieces 3..5
    fs = lt.file_storage()
    lt.add_files(fs, str(root / "t"))
    ct = lt.create_torrent(fs, 16 * 1024)
    lt.set_piece_hashes(ct, str(root))
    return lt.torrent_info(ct.generate())


def main():
    assert parse_committed(None) == 0
    assert parse_committed("bytes=0-262143") == 262144

    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        info = make_torrent(root)
        h = FakeHandle(info)
        s = TorrentStreamer("x", h, root, [1], asyncio.Event())  # only b.bin selected
        s.buffer = s.chunk = 16 * 1024
        b = 1 if info.files().file_path(1).endswith("b.bin") else 0
        s.selected = [b]
        start = info.files().file_offset(b)
        s._set_window(start)
        wanted = [i for i, p in enumerate(h.prios) if p]
        assert wanted == [start // (16 * 1024)], wanted  # one-piece window at the file start
        s.chunk = 64 * 1024  # buffer < chunk: window must still cover the whole chunk or it never fills
        s._set_window(start)
        assert [i for i, p in enumerate(h.prios) if p] == [3, 4, 5]

        from backend.config import settings
        settings.torrent.stream_buffer_mb, settings.google_drive.chunk_size = 3, 512 * 1024 + 7
        s._load_limits()  # live settings edit is picked up and chunk re-aligned to 256 KiB
        assert (s.buffer, s.chunk) == (3 * 1024 * 1024, 512 * 1024), (s.buffer, s.chunk)

        h.have = set(range(info.num_pieces()))
        assert s._range_ready(b, 0, info.files().file_size(b))
        h.have.discard(info.num_pieces() - 1)
        assert not s._range_ready(b, 0, info.files().file_size(b))

        f = root / "punch.bin"
        f.write_bytes(os.urandom(1024 * 1024))
        if punch_hole(f, 512 * 1024):
            assert f.stat().st_size == 1024 * 1024
            assert f.read_bytes()[:512 * 1024] == b"\0" * (512 * 1024)
            print("punch_hole: ok")
        else:
            print("punch_hole: unsupported here (non-Linux)")
    print("ok")


if __name__ == "__main__":
    main()
