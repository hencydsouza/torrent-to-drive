// Friendly names for the backend schemas. src/types/api.d.ts is generated: `npm run gen:api`.
import type { components } from './api';

type Schemas = components['schemas'];
export type TorrentState = Schemas['TorrentState'];
export type TorrentInfo = Schemas['TorrentInfo'];
export type TorrentMetadata = Schemas['TorrentMetadata'];
export type TorrentProgress = Schemas['TorrentProgress'];
export type FileInfo = Schemas['FileInfo'];
export type DriveFile = Schemas['DriveFile'];
export type DriveHealth = Schemas['DriveHealth'];
export type ServerStats = Schemas['ServerStats'];
export type AppSettings = Schemas['AppSettings'];
export type SettingsUpdate = Schemas['SettingsUpdate'];

// Messages pushed on /ws by backend/main.py broadcast_progress (not part of OpenAPI).
export type WsMessage =
  | { type: 'stats'; data: ServerStats }
  | { type: 'progress'; torrent_id: string; data: TorrentProgress };
