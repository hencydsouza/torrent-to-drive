import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';
import { describeState } from '../../lib/torrentState';
import type { ActionKind } from '../../hooks/useTorrents';
import type { TorrentInfo, TorrentProgress, TorrentState } from '../../types';
import { formatBytes, formatDateTime, formatDuration, formatSpeed } from '../../lib/format';

// Line 1 answers "is it OK?" (name + status). Line 2 is the phase-colored bar and live numbers.
function liveDetail(state: TorrentState, p: Partial<TorrentProgress>) {
  if (state === 'downloading') {
    const eta = formatDuration(p.eta);
    return [`${formatSpeed(p.download_rate)} down`, `${p.num_peers || 0} peers`, eta && `${eta} left`].filter(Boolean).join(' · ');
  }
  if (state === 'uploading') return 'Sending files to Drive';
  if (state === 'uploaded') return 'Done. Files are in your Drive folder';
  return null;
}

interface TorrentRowProps {
  torrent: TorrentInfo;
  progress?: TorrentProgress | null;
  busy?: ActionKind;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (torrent: TorrentInfo) => void;
}

export default function TorrentRow({ torrent, progress, busy, onPause, onResume, onDelete }: TorrentRowProps) {
  const { state } = torrent;
  const { label, tone } = describeState(state);
  const p: Partial<TorrentProgress> = progress ?? {};
  const percent = state === 'uploaded' ? 100 : p.progress || 0;
  const name = torrent.metadata?.name;
  const detail = p.error || liveDetail(state, p);

  return (
    <tr>
      <td className="col-main">
        <div className="row-title">
          <span className="row-name truncate" title={name}>{name || 'Reading metadata…'}</span>
          <span className={`badge tone-${tone}`}><span className="badge-dot" />{label}</span>
        </div>
        <div className={`row-progress tone-${tone}`}>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} progress`}>
            <div className="progress-fill" style={{ '--value': `${percent}%` }} />
          </div>
          <span className="row-percent num">{percent.toFixed(0)}%</span>
        </div>
        {detail ? <p className={`row-detail${p.error ? ' tone-danger' : ''}`}>{detail}</p> : null}
      </td>
      <td className="col-size cell-nowrap">{formatBytes(torrent.metadata?.total_size)}</td>
      <td className="col-date cell-nowrap muted">{formatDateTime(torrent.created_at)}</td>
      <td className="col-actions">
        <div className="row-actions">
          {(state === 'downloading' || state === 'uploading') && <IconButton icon="pause" label="Pause" busy={busy === 'pause'} disabled={!!busy} onClick={() => onPause(torrent.id)} />}
          {(state === 'paused' || state === 'metadata_ready') && (
            <IconButton icon="play" label={state === 'paused' ? 'Resume' : 'Start'} busy={busy === 'resume'} disabled={!!busy} onClick={() => onResume(torrent.id)} />
          )}
          {state === 'uploaded' && torrent.drive_file_id ? (
            <a
              className="btn-icon"
              href={`https://drive.google.com/drive/folders/${torrent.drive_file_id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Drive"
              aria-label="Open in Drive"
            >
              <Icon name="external" />
            </a>
          ) : null}
          <IconButton icon="copy" label="Copy magnet link" onClick={() => navigator.clipboard?.writeText(torrent.magnet_url)} />
          <IconButton icon="trash" label="Delete" danger busy={busy === 'delete'} disabled={!!busy} onClick={() => onDelete(torrent)} />
        </div>
      </td>
    </tr>
  );
}
