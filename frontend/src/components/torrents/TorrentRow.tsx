import { Fragment } from 'react';
import Icon from '../ui/Icon';
import TorrentDetailsPanel from './TorrentDetailsPanel';
import { useUi } from '../../stores/ui';
import IconButton from '../ui/IconButton';
import { barPercent, describeState, isLive } from '../../lib/torrentState';
import type { ActionKind } from '../../hooks/useTorrents';
import type { TorrentInfo, TorrentProgress, TorrentState } from '../../types';
import { formatBytes, formatDateTime, formatDuration, formatSpeed } from '../../lib/format';

// Line 1 answers "is it OK?" (name + status). Line 2 is the phase-colored bar and live numbers.
function liveDetail(state: TorrentState, p: Partial<TorrentProgress>) {
  const onDrive = p.uploaded ? `${formatBytes(p.uploaded)} on Drive` : null;
  if (state === 'downloading') {
    const eta = formatDuration(p.eta);
    return [`${formatBytes(p.downloaded)} of ${formatBytes(p.total_size)}`, `${formatSpeed(p.download_rate)} down`,
      `${p.num_peers || 0} peers`, eta && `${eta} left`, onDrive].filter(Boolean).join(' · ');
  }
  if (state === 'uploading') {
    // Streaming downloads while uploading, so show both sides.
    return [`${formatBytes(p.uploaded)} of ${formatBytes(p.total_size)} on Drive`,
      p.download_rate ? `${formatSpeed(p.download_rate)} down` : null].filter(Boolean).join(' · ');
  }
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

type RowActionsProps = Omit<TorrentRowProps, 'progress'>;

function RowActions({ torrent, busy, onPause, onResume, onDelete }: RowActionsProps) {
  const { state } = torrent;
  return (
    <div className="row-actions">
      {(state === 'downloading' || state === 'uploading') && <IconButton icon="pause" label="Pause" busy={busy === 'pause'} disabled={!!busy} onClick={() => onPause(torrent.id)} />}
      {(state === 'paused' || state === 'metadata_ready' || state === 'error') && (
        <IconButton icon="play" label={{ paused: 'Resume', error: 'Retry' }[state as string] ?? 'Start'} busy={busy === 'resume'} disabled={!!busy} onClick={() => onResume(torrent.id)} />
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
  );
}

export default function TorrentRow({ torrent, progress, busy, onPause, onResume, onDelete }: TorrentRowProps) {
  const { state } = torrent;
  const { label, tone } = describeState(state);
  const p: Partial<TorrentProgress> = progress ?? {};
  const percent = barPercent(state, p);
  const name = torrent.metadata?.name;
  const detail = p.error || liveDetail(state, p);
  const expanded = useUi((s) => s.expandedId === torrent.id);
  const toggleExpanded = useUi((s) => s.toggleExpanded);
  const filesId = `files-${torrent.id}`;

  return (
    <Fragment>
    <tr>
      <td className="col-main">
        <div className="row-title">
          <button
            type="button"
            className="row-toggle"
            aria-expanded={expanded}
            aria-controls={filesId}
            title={expanded ? 'Hide details' : 'Show files, pieces, peers and trackers'}
            onClick={() => toggleExpanded(torrent.id)}
          >
            <Icon name="chevron" className={expanded ? 'is-open' : undefined} />
            <span className="row-name truncate" title={name}>{name || 'Reading metadata…'}</span>
          </button>
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
        <RowActions torrent={torrent} busy={busy} onPause={onPause} onResume={onResume} onDelete={onDelete} />
      </td>
    </tr>
    {expanded ? (
      <tr className="row-files" id={filesId}>
        <td colSpan={4}>
          <TorrentDetailsPanel torrent={torrent} live={isLive(state)} panelId={`detail-${torrent.id}`} />
        </td>
      </tr>
    ) : null}
    </Fragment>
  );
}
