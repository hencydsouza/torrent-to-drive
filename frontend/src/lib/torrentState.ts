import type { TorrentProgress, TorrentState } from '../types';

export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

// One place that knows what each backend TorrentState means in the UI.
const STATES: Record<TorrentState, { label: string; tone: Tone }> = {
  fetching_metadata: { label: 'Reading metadata', tone: 'neutral' },
  metadata_ready: { label: 'Ready to start', tone: 'neutral' },
  downloading: { label: 'Downloading', tone: 'accent' },
  completed: { label: 'Downloaded', tone: 'info' },
  uploading: { label: 'Uploading to Drive', tone: 'info' },
  uploaded: { label: 'On Drive', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
};

export const describeState = (state: TorrentState) => STATES[state];

export type TorrentFilter = 'all' | 'active' | 'done' | 'failed';
const GROUP: Record<TorrentState, Exclude<TorrentFilter, 'all'>> = {
  fetching_metadata: 'active', metadata_ready: 'active', downloading: 'active', completed: 'active',
  uploading: 'active', paused: 'active', uploaded: 'done', error: 'failed',
};
export const FILTERS: { id: TorrentFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'done', label: 'On Drive' }, { id: 'failed', label: 'Failed' },
];
export const matchesFilter = (state: TorrentState, f: TorrentFilter) => f === 'all' || GROUP[state] === f;

// States the WebSocket streams live numbers for (backend/main.py broadcast_progress).
export const isLive = (state: TorrentState) => state === 'downloading' || state === 'uploading';

// While uploading the bar tracks bytes on Drive; download progress there is 100% (or a moving window when streaming).
export function barPercent(state: TorrentState, p: Partial<TorrentProgress>) {
  if (state === 'uploaded') return 100;
  if (state === 'uploading') return p.total_size ? ((p.uploaded || 0) / p.total_size) * 100 : 0;
  return p.progress || 0;
}
