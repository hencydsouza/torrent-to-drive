import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 2000 } },
});

// One place for cache keys so invalidation can't drift from the queries.
export const keys = {
  torrents: ['torrents'],
  progress: ['torrents', 'progress'],
  stats: ['torrents', 'stats'],
  files: (torrentId: string) => ['torrents', 'files', torrentId] as const,
  driveFiles: (folderId?: string) => ['drive', 'files', folderId ?? 'root'] as const,
  driveHealth: ['drive', 'health'],
  settings: ['settings'],
  metadata: (magnet: string) => ['metadata', magnet] as const,
} as const;
