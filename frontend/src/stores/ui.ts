import { create } from 'zustand';
import type { TorrentInfo } from '../types';
import type { TorrentFilter } from '../lib/torrentState';

export interface Crumb {
  id?: string; // undefined = configured Drive root
  name: string;
}

export type DetailTab = 'files' | 'pieces' | 'peers' | 'trackers' | 'info';

interface UiState {
  filter: TorrentFilter;
  pendingDelete: TorrentInfo | null;
  expandedId: string | null; // torrent whose file list is open
  detailTab: DetailTab;
  drivePath: Crumb[];
  driveSearch: string;
  setFilter: (filter: TorrentFilter) => void;
  setPendingDelete: (torrent: TorrentInfo | null) => void;
  toggleExpanded: (id: string) => void;
  setDetailTab: (tab: DetailTab) => void;
  openFolder: (crumb: Crumb) => void;
  goToCrumb: (index: number) => void;
  setDriveSearch: (q: string) => void;
  pickerPath: Crumb[] | null; // folder picker breadcrumbs, null = closed
  openPicker: () => void;
  closePicker: () => void;
  pickerEnter: (crumb: Crumb) => void;
  pickerGoTo: (index: number) => void;
}

// Client-only view state. Server data stays in react-query.
export const useUi = create<UiState>()((set) => ({
  filter: 'all',
  pendingDelete: null,
  expandedId: null,
  detailTab: 'files',
  drivePath: [{ name: 'Drive folder' }],
  driveSearch: '',
  setFilter: (filter) => set({ filter }),
  setPendingDelete: (pendingDelete) => set({ pendingDelete }),
  toggleExpanded: (id) => set((s) => ({ expandedId: s.expandedId === id ? null : id })),
  openFolder: (crumb) => set((s) => ({ drivePath: [...s.drivePath, crumb], driveSearch: '' })),
  goToCrumb: (index) => set((s) => ({ drivePath: s.drivePath.slice(0, index + 1), driveSearch: '' })),
  setDriveSearch: (driveSearch) => set({ driveSearch }),
  setDetailTab: (detailTab) => set({ detailTab }),
  pickerPath: null,
  openPicker: () => set({ pickerPath: [{ id: 'root', name: 'My Drive' }] }),
  closePicker: () => set({ pickerPath: null }),
  pickerEnter: (crumb) => set((s) => ({ pickerPath: [...(s.pickerPath ?? []), crumb] })),
  pickerGoTo: (index) => set((s) => ({ pickerPath: s.pickerPath?.slice(0, index + 1) ?? null })),
}));
