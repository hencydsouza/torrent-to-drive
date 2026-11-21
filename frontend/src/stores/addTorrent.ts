import { create } from 'zustand';

interface AddTorrentState {
  open: boolean;
  magnet: string; // what's in the input
  submitted: string; // magnet whose file list we asked for (metadata itself lives in react-query)
  selected: Set<number> | null; // null = every file
  setOpen: (open: boolean) => void;
  setMagnet: (magnet: string) => void;
  submit: (magnet: string) => void;
  setSelected: (selected: Set<number> | null) => void;
  reset: () => void;
}

const empty = { open: false, magnet: '', submitted: '', selected: null };

// Add-torrent draft lives outside the page so it survives tab switches.
export const useAddTorrent = create<AddTorrentState>()((set) => ({
  ...empty,
  setOpen: (open) => set({ open }),
  setMagnet: (magnet) => set({ magnet }),
  submit: (magnet) => set({ magnet, submitted: magnet.trim(), selected: null }),
  setSelected: (selected) => set({ selected }),
  reset: () => set(empty),
}));
