import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon, { Spinner } from '../ui/Icon';
import Alert from '../ui/Alert';
import FileTree from './FileTree';
import { buildFileTree } from '../../lib/fileTree';
import { keys } from '../../lib/queryClient';
import { torrentAPI } from '../../services/api';
import { formatBytes } from '../../lib/format';
import { useAddTorrent } from '../../stores/addTorrent';
import type { TorrentMetadata } from '../../types';

// File picker for a read magnet + the "send to Drive" action.
export default function FileSelection({ magnet, metadata }: { magnet: string; metadata: TorrentMetadata }) {
  const qc = useQueryClient();
  const { selected: picked, setSelected, reset } = useAddTorrent();
  const allFiles = useMemo(() => new Set(metadata.files.map((f) => f.index)), [metadata]);
  const selected = picked ?? allFiles;
  const tree = useMemo(() => buildFileTree(metadata.files), [metadata]);

  const start = useMutation({
    mutationFn: async () => {
      const torrent = await torrentAPI.addTorrent(magnet);
      await torrentAPI.startDownload(torrent.id, [...selected]);
    },
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: keys.torrents, exact: true });
    },
  });

  const toggleFile = (index: number) => {
    const next = new Set(selected);
    next.has(index) ? next.delete(index) : next.add(index);
    setSelected(next);
  };

  return (
    <div className="metadata">
      <div className="metadata-head">
        <div className="metadata-title">
          <h2 className="truncate" title={metadata.name}>{metadata.name}</h2>
          <p className="muted num">{formatBytes(metadata.total_size)} · {metadata.num_files} files</p>
        </div>
        <div className="metadata-tools">
          <span className="muted num">{selected.size} / {metadata.num_files} selected</span>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setSelected(null)}>All</button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setSelected(new Set())}>None</button>
        </div>
      </div>
      <div className="file-tree">
        <FileTree node={tree} selected={selected} onToggle={toggleFile} />
      </div>
      {start.error ? <Alert onDismiss={start.reset}>{start.error.message}</Alert> : null}
      <button type="button" className="btn btn-primary btn-block" onClick={() => start.mutate()} disabled={start.isPending || selected.size === 0}>
        {start.isPending ? <Spinner /> : <Icon name="download" />}
        Send {selected.size} of {metadata.num_files} files to Drive
      </button>
    </div>
  );
}
