import createClient from 'openapi-fetch';
import type { paths } from '../types/api';
import type { SettingsUpdate, TorrentState, WsMessage } from '../types';

// Typed against the generated OpenAPI schema: wrong paths, params or bodies fail `tsc`.
const client = createClient<paths>();

// Throw on non-2xx with FastAPI's `detail` as the message; return the typed body otherwise.
async function unwrap<R extends { data?: unknown; error?: unknown; response: Response }>(
  call: Promise<R>,
  fallback: string,
): Promise<NonNullable<R['data']>> {
  const { data, error, response } = await call;
  if (!response.ok) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg).join('; ')
      : typeof detail === 'string' ? detail : '';
    throw new Error(message || `${fallback} (${response.status})`);
  }
  return data as NonNullable<R['data']>;
}

const torrentPath = (torrent_id: string) => ({ params: { path: { torrent_id } } });

export const torrentAPI = {
  fetchMetadata: (magnetUrl: string) =>
    unwrap(client.POST('/api/torrents/metadata', { body: { magnet_url: magnetUrl } }), 'Could not read the magnet link'),
  addTorrent: (magnetUrl: string) =>
    unwrap(client.POST('/api/torrents/', { body: { magnet_url: magnetUrl } }), 'Could not add torrent'),
  startDownload: (torrentId: string, fileIndices: number[] | null = null) =>
    unwrap(
      client.POST('/api/torrents/{torrent_id}/download', {
        ...torrentPath(torrentId),
        body: { torrent_id: torrentId, file_indices: fileIndices },
      }),
      'Could not start download',
    ),
  listTorrents: (state?: TorrentState) =>
    unwrap(client.GET('/api/torrents/', { params: { query: { state } } }), 'Could not load torrents'),
  getTorrent: (torrentId: string) => unwrap(client.GET('/api/torrents/{torrent_id}', torrentPath(torrentId)), 'Could not load torrent'),
  getProgress: (torrentId: string) =>
    unwrap(client.GET('/api/torrents/{torrent_id}/progress', torrentPath(torrentId)), 'Could not load progress'),
  pauseTorrent: (torrentId: string) => unwrap(client.POST('/api/torrents/{torrent_id}/pause', torrentPath(torrentId)), 'Could not pause'),
  resumeTorrent: (torrentId: string) => unwrap(client.POST('/api/torrents/{torrent_id}/resume', torrentPath(torrentId)), 'Could not resume'),
  deleteTorrent: (torrentId: string, deleteFiles = false) =>
    unwrap(
      client.DELETE('/api/torrents/{torrent_id}', {
        params: { path: { torrent_id: torrentId }, query: { delete_files: deleteFiles } },
      }),
      'Could not delete',
    ),
  getStats: () => unwrap(client.GET('/api/stats'), 'Could not load stats'),
};

export const storageAPI = {
  listFiles: (folderId?: string) =>
    unwrap(client.GET('/api/storage/files', { params: { query: { folder_id: folderId } } }), 'Could not load Drive files'),
  getFile: (fileId: string) =>
    unwrap(client.GET('/api/storage/files/{file_id}', { params: { path: { file_id: fileId } } }), 'Could not load file'),
  checkHealth: () => unwrap(client.GET('/api/storage/health'), 'Drive health check failed'),
};

export const settingsAPI = {
  get: () => unwrap(client.GET('/api/settings'), 'Could not load settings'),
  update: (changes: SettingsUpdate) => unwrap(client.PUT('/api/settings', { body: changes }), 'Could not save settings'),
};

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private onMessage: (message: WsMessage) => void, private reconnectDelay = 1000) {}

  connect() {
    this.closed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.ws.onmessage = (event) => this.onMessage(JSON.parse(event.data) as WsMessage);
    this.ws.onclose = () => {
      // Only reconnect on unexpected drops; disconnect() sets `closed` first.
      if (!this.closed) this.retryTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    };
  }

  disconnect() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }
}
