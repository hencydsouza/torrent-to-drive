# Torrent-to-Drive

Paste a magnet link, pick the files you want, and they end up in your Google Drive. A web UI shows progress, lets you pause and resume, and lets you browse what's already uploaded.

**It works even when the torrent is bigger than your disk.** Turn on *Stream to Drive* and the app downloads the torrent in order and uploads each chunk as soon as it's done, then deletes it locally. Disk use stays around the buffer size you set (2 GB by default).

> Only download content you have the rights to.

---

## Pick how to run it

| Option | Good for | You need |
|---|---|---|
| [Google Colab](#option-1-google-colab) | Trying it out, no install | A Google account |
| [Docker](#option-2-docker-recommended) | Your own computer or server | Docker + a Google Cloud OAuth client |
| [Without Docker](#option-3-without-docker) | A Linux server where you don't want Docker | Python 3.9+, Node 20+, a Google Cloud OAuth client |

---

## Option 1: Google Colab

1. Open [`torrent_to_drive_colab.ipynb`](torrent_to_drive_colab.ipynb) in Colab (**File → Open notebook → GitHub**, then paste this repo's URL).
2. In the **Settings** cell:
   - `DRIVE_FOLDER_ID`: leave it as `root` to upload to My Drive, or paste a folder ID ([how to find it](#finding-a-drive-folder-id)).
   - `STREAM_TO_DRIVE`: turn it on for torrents bigger than about 100 GB, which is Colab's disk size.
3. Click **Runtime → Run all**. Installing takes 2–3 minutes.
4. Sign in when the Google popup appears. The app uses this login for Drive, so you don't need any credential files.
5. Click the link printed by the **Open the UI** cell. If the page doesn't load or doesn't update, run the optional **Cloudflare** cell to get a public link. Anyone with that link can control the app, so don't share it.

**Things to know:** Colab wipes the machine when the session ends (free tier: about 90 minutes idle, 12 hours max). Unfinished torrents start over on a new session, but files already in Drive are skipped. Colab may also stop sessions that use P2P traffic.

---

## Option 2: Docker (recommended)

### 1. Start

No clone needed. Make a folder and save this as `docker-compose.yml` in it:

```yaml
services:
  torrent-to-drive:
    image: ghcr.io/hencydsouza/torrent-to-drive:latest
    ports:
      - "8000:8000"
    volumes:
      - ./config:/app/config   # Google login + settings
      - ./data:/app/data       # downloads, deleted after upload
    restart: unless-stopped
```

```bash
docker compose up -d
```

Open **http://localhost:8000**. The image runs as user 1000. On Linux, if the logs show permission errors, run `sudo chown -R 1000:1000 config data`.

Working from a clone instead? `docker compose up -d --build` builds the image from source.

### 2. Get a Google OAuth client (one time)

You need a Google OAuth client so the app can upload to your Drive.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project, or pick an existing one.
2. **APIs & Services → Library**: search for **Google Drive API** and click **Enable**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in the required fields, and add your own email under **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**. Choose **Desktop app** as the type.
5. Download the JSON file.

### 3. Connect Google Drive in the app

Go to **Settings → Google account**:

1. **Upload client file**: pick the JSON file you downloaded.
2. **Sign in with Google** and approve access.
3. If you opened the app at `localhost`, you land back on Settings, connected. From another machine, the browser ends on a page that won't load. Copy that page's full address, paste it into the box on Settings, and press **Finish**.

Then **Drive upload → Change folder** picks where torrents go: My Drive or a folder you create there. Each torrent gets its own subfolder.

Everything is saved in `config/`, so it survives updates and restarts.

- **Update:** `docker compose pull && docker compose up -d`
- **Logs:** `docker compose logs -f`
- **Older setups:** `DRIVE_FOLDER_ID` in `.env` still works. It's only used when no folder was picked on the Settings page. An existing `config/token.json` keeps working too.

---

## Option 3: Without Docker

On Debian or Ubuntu:

```bash
./setup.sh                          # installs libtorrent, Python packages, builds the UI
./start.sh                          # runs the app on port 8000
```

Then connect Google Drive on the Settings page, as in [Docker steps 2 and 3](#2-get-a-google-oauth-client-one-time). `ecosystem.config.js` lets you run it under PM2 so it stays up.

---

## Using it

1. **Torrents** tab → **Add torrent** (or press `n`). Paste a magnet link; it's read automatically.
2. Untick any files you don't want, then click **Start download**.
3. Each row shows downloaded vs total, speed, peers, time left, and how much is already on Drive.
4. When a torrent is done, the row gets an **Open in Drive** link and the local copy is deleted.
5. The **Storage** tab lets you browse and search your Drive folder.

**Pause and resume:** pausing keeps what's already downloaded. If the app restarts or crashes, running torrents come back as **Paused**. Click Resume.

**Moving to another machine:** copy the `data/` folder (torrent list, partial downloads, upload positions) and the `config/` folder (settings and Google login). Then resume.

---

## Settings

Most settings are on the **Settings** page and take effect without a restart.

| Setting | What it does | Default |
|---|---|---|
| Stream to Drive | Upload while downloading, deleting local chunks as they go. Use it when the torrent is bigger than your free disk. | Off |
| Stream buffer | How much the torrent can download ahead of the upload. Roughly the disk space each streaming torrent uses. | 2 GB |
| Parallel torrents | How many torrents download at once | 5 |
| Max peers | Connection limit | 200 |
| Download / upload limit | Speed caps, 0 = unlimited | 0 |
| Upload chunk size | Size of each piece sent to Drive. Bigger is faster on fast connections. | 10 MB |
| Retries | How many times a failed Drive upload is retried | 5 |
| Extra trackers | Added to every magnet. More trackers usually means more peers. | none |

Settings are saved to `config/settings.yaml`. If `STREAM_TO_DRIVE` or `STREAM_BUFFER_MB` is set in `.env`, that wins and the setting is locked in the UI.

### Finding a Drive folder ID

Open the folder in Drive. The ID is the last part of the URL: `drive.google.com/drive/folders/`**`1a2b3c4d5e6f`**.

---

## Limits worth knowing

- **Google limits uploads to 750 GB per day** per account. Past that, uploads pause until the next day.
- The app asks for full Google Drive access so the folder picker can show and upload into your own folders. The sign-in token in `config/` can read and change your whole Drive, so keep that folder private. If you signed in with an older version, sign in again once.
- Streaming downloads in order, which can be a little slower than normal mode on torrents with few peers.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Not authenticated" or Drive shows disconnected | Sign in again under **Settings → Google account**. If it still fails, delete `config/token.json` first. |
| Google says "access blocked" or "app not verified" | Add your email under **Test users** on the OAuth consent screen. |
| Download is slow or stuck at 0 | Add trackers in Settings and check that the torrent has seeders. On a cloud VM, check the firewall allows outgoing traffic. |
| Disk fills up | Turn on **Stream to Drive**, or lower the stream buffer. |
| Port 8000 already in use | Change the left side of `ports` in `docker-compose.yml`, for example `"8080:8000"`. |

---

## Security

There is **no login** on the web UI. Anyone who can open the page can add torrents and see your Drive folder. Don't expose port 8000 to the internet. Use a firewall, an SSH tunnel (`ssh -L 8000:localhost:8000 server`), or a reverse proxy with authentication. Keep `config/credentials.json` and `config/token.json` private, because `token.json` gives access to your Drive.

---

## For developers

- **Backend:** FastAPI + libtorrent + SQLite (`backend/`). API docs at `/docs` while it runs.
- **Frontend:** React + TypeScript + Vite, TanStack Query for server data, Zustand for UI state (`frontend/src/`).
- **Dev UI:** `cd frontend && npm install && npm run dev`. API calls are proxied to `:8000`.
- **API types:** after changing a backend model, run `npm run gen:api` with the backend running.
- **Streaming self-check:** `PYTHONPATH=. python tests/test_streamer.py` (Linux only, because it uses hole punching).

## License

MIT
