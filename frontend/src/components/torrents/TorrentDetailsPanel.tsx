import { useQuery } from '@tanstack/react-query';
import { torrentAPI } from '../../services/api';
import { keys } from '../../lib/queryClient';
import { formatBytes, formatDuration, formatSpeed } from '../../lib/format';
import { useUi, type DetailTab } from '../../stores/ui';
import type { TorrentDetails, TorrentInfo } from '../../types';
import FileProgressList from './FileProgressList';
import PieceGrid from './PieceGrid';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'peers', label: 'Peers' },
  { id: 'trackers', label: 'Trackers' },
  { id: 'info', label: 'Info' },
];

function Info({ d, torrent }: { d: TorrentDetails; torrent: TorrentInfo }) {
  const p = d.progress;
  const left = Math.max(0, p.total_size - p.downloaded);
  const rows: [string, string][] = [
    ['Time left (download)', formatDuration(p.eta) || (left ? 'Waiting for peers' : 'Done')],
    ['Remaining', formatBytes(left)],
    ['Download speed', formatSpeed(p.download_rate)],
    ['Seeding speed', formatSpeed(p.upload_rate)],
    ['On Drive', `${formatBytes(p.uploaded)} of ${formatBytes(p.total_size)}`],
    ['Connections', `${d.connections} (${p.num_seeds} seeds, ${p.num_peers} peers)`],
    ['Availability', `${d.availability.toFixed(2)} copies`],
    ['Pieces', `${d.pieces.length.toLocaleString()} × ${formatBytes(d.piece_size)}`],
    ['Downloaded (all time)', formatBytes(d.all_time_download)],
    ['Uploaded (all time)', formatBytes(d.all_time_upload)],
    ['Wasted', formatBytes(d.wasted)],
    ['Active for', formatDuration(d.active_seconds) || '0s'],
    ['Order', d.sequential ? 'Sequential (streaming)' : 'Rarest first'],
    ['Info hash', d.info_hash],
    ['Saved to', d.save_path],
    ['Torrent ID', torrent.id],
  ];
  return (
    <dl className="info-grid">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Peers({ d }: { d: TorrentDetails }) {
  if (!d.peers.length) return <p className="muted file-list-note">No peers connected right now.</p>;
  return (
    <div className="table-scroll detail-scroll">
      <table className="data-table detail-table">
        <thead><tr><th>Address</th><th>Client</th><th className="cell-end">Has</th><th className="cell-end">Down</th><th className="cell-end">Up</th></tr></thead>
        <tbody>
          {d.peers.map((p) => (
            <tr key={p.address}>
              <td className="num">{p.address}{p.seed ? <span className="badge tone-success peer-seed">seed</span> : null}</td>
              <td className="truncate">{p.client || 'Unknown'}</td>
              <td className="cell-end num">{p.progress.toFixed(0)}%</td>
              <td className="cell-end num">{formatSpeed(p.download_rate)}</td>
              <td className="cell-end num">{formatSpeed(p.upload_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TRACKER_TONE: Record<string, string> = { working: 'success', error: 'danger', updating: 'info' };

function Trackers({ d }: { d: TorrentDetails }) {
  if (!d.trackers.length) return <p className="muted file-list-note">No trackers. Peers come from DHT only.</p>;
  return (
    <div className="table-scroll detail-scroll">
      <table className="data-table detail-table">
        <thead><tr><th>Tracker</th><th>Status</th><th className="cell-end">Peers</th></tr></thead>
        <tbody>
          {d.trackers.map((t) => (
            <tr key={t.url}>
              <td className="truncate" title={t.url}>{t.url}</td>
              <td title={t.message ?? undefined}>
                <span className={`badge tone-${TRACKER_TONE[t.status] ?? 'neutral'}`}>{t.status}</span>
              </td>
              <td className="cell-end num">{t.peers ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TorrentDetailsPanel({ torrent, live, panelId }: { torrent: TorrentInfo; live: boolean; panelId: string }) {
  const tab = useUi((s) => s.detailTab);
  const setTab = useUi((s) => s.setDetailTab);
  const details = useQuery({
    queryKey: keys.details(torrent.id),
    queryFn: () => torrentAPI.getDetails(torrent.id),
    enabled: tab !== 'files',
    refetchInterval: live ? 2000 : false,
  });

  const body = () => {
    if (tab === 'files') return <FileProgressList torrentId={torrent.id} live={live} />;
    if (details.isPending) return <p className="muted file-list-note">Loading…</p>;
    if (details.error) return <p className="tone-danger file-list-note">{details.error.message}</p>;
    const d = details.data;
    if (!d) return <p className="muted file-list-note">Live details appear while the torrent is active in this session.</p>;
    if (tab === 'pieces') return <PieceGrid pieces={d.pieces} />;
    if (tab === 'peers') return <Peers d={d} />;
    if (tab === 'trackers') return <Trackers d={d} />;
    return <Info d={d} torrent={torrent} />;
  };

  return (
    <div className="detail-panel">
      <div className="detail-tabs" role="tablist" aria-label="Torrent details">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${panelId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${panelId}-body`}
            className={`detail-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${panelId}-body`} aria-labelledby={`${panelId}-${tab}`}>{body()}</div>
    </div>
  );
}
