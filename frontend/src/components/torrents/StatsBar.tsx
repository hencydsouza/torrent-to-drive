import Icon from '../ui/Icon';
import { formatSpeed } from '../../lib/format';
import type { ServerStats } from '../../types';

// Quiet inline summary for the page header; hidden while nothing is active.
export default function StatsBar({ stats }: { stats: Partial<ServerStats> }) {
  if (!stats.active_torrents) return null;
  return (
    <span className="stats-bar num">
      <span className="stats-item tone-accent"><Icon name="download" label="Download speed" />{formatSpeed(stats.total_download_rate)}</span>
      <span className="stats-item tone-info"><Icon name="upload" label="Upload speed" />{formatSpeed(stats.total_upload_rate)}</span>
      <span className="stats-item">{stats.active_torrents} active · {stats.total_peers || 0} peers</span>
    </span>
  );
}
