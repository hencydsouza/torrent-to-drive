import { create } from 'zustand';
import type { TorrentInfo } from '../types';
import type { TorrentFilter } from '../lib/torrentState';

export interface Crumb {
  id?: string; // undefined = configured Drive root
  name: string;
}

interface UiState {
  filter: TorrentFilter;
  pendingDelete: TorrentInfo | null;
  expandedId: string | null; // torrent whose file list is open
  drivePath: Crumb[];
  driveSearch: string;
  setFilter: (filter: TorrentFilter) => void;
  setPendingDelete: (torrent: TorrentInfo | null) => void;
  toggleExpanded: (id: string) => void;
  openFolder: (crumb: Crumb) => void;
  goToCrumb: (index: number) => void;
  setDriveSearch: (q: string) => void;
}

// Client-only view state. Server data stays in react-query.
export const useUi = create<UiState>()((set) => ({
  filter: 'all',
  pendingDelete: null,
  expandedId: null,
  drivePath: [{ name: 'Drive folder' }],
  driveSearch: '',
  setFilter: (filter) => set({ filter }),
  setPendingDelete: (pendingDelete) => set({ pendingDelete }),
  toggleExpanded: (id) => set((s) => ({ expandedId: s.expandedId === id ? null : id })),
  openFolder: (crumb) => set((s) => ({ drivePath: [...s.drivePath, crumb], driveSearch: '' })),
  goToCrumb: (index) => set((s) => ({ drivePath: s.drivePath.slice(0, index + 1), driveSearch: '' })),
  setDriveSearch: (driveSearch) => set({ driveSearch }),
}));
