import { useEffect } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { torrentAPI, WebSocketClient } from '../services/api';
import { keys } from '../lib/queryClient';
import type { ServerStats, TorrentProgress } from '../types';

export type ActionKind = 'pause' | 'resume' | 'delete';
type ProgressById = Record<string, TorrentProgress>;

const POLL_MS = 5000;
const ACTION_KEY = ['torrent-action'];
const ACTIONS: Record<ActionKind, (id: string) => Promise<unknown>> = {
  pause: torrentAPI.pauseTorrent,
  resume: torrentAPI.resumeTorrent,
  delete: (id: string) => torrentAPI.deleteTorrent(id, true),
};

// Torrent list (polled) + live WebSocket progress/stats written straight into the query cache.
export function useTorrents() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: keys.torrents, queryFn: () => torrentAPI.listTorrents(), refetchInterval: POLL_MS });
  const { data: progressById = {} } = useQuery<ProgressById>({ queryKey: keys.progress, queryFn: () => ({}), staleTime: Infinity });
  const { data: stats = {} } = useQuery<Partial<ServerStats>>({ queryKey: keys.stats, queryFn: () => ({}), staleTime: Infinity });

  useEffect(() => {
    const ws = new WebSocketClient((message) => {
      if (message.type === 'progress') {
        qc.setQueryData<ProgressById>(keys.progress, (prev = {}) => ({ ...prev, [message.torrent_id]: message.data }));
      } else if (message.type === 'stats') {
        qc.setQueryData<Partial<ServerStats>>(keys.stats, message.data);
      }
    });
    ws.connect();
    return () => ws.disconnect();
  }, [qc]);

  const action = useMutation({
    mutationKey: ACTION_KEY,
    mutationFn: ({ id, kind }: { id: string; kind: ActionKind }) => ACTIONS[kind](id),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.torrents, exact: true }),
  });

  // Each row's in-flight action, so concurrent actions on different rows don't overwrite each other.
  const pending = useMutationState({ filters: { mutationKey: ACTION_KEY, status: 'pending' }, select: (m) => m.state.variables as { id: string; kind: ActionKind } });
  const busyById: Record<string, ActionKind> = Object.fromEntries(pending.map(({ id, kind }) => [id, kind]));

  const run = (kind: ActionKind) => (id: string) => action.mutate({ id, kind });

  return {
    torrents: list.data ?? [],
    progressById,
    stats,
    busyById,
    error: action.error?.message || list.error?.message || '',
    clearError: action.reset,
    pause: run('pause'),
    resume: run('resume'),
    remove: run('delete'),
  };
}
