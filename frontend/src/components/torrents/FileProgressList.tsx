import { useQuery } from '@tanstack/react-query';
import { torrentAPI } from '../../services/api';
import { keys } from '../../lib/queryClient';
import { formatBytes } from '../../lib/format';
import type { FileProgress } from '../../types';

const pct = (part: number, whole: number) => (whole ? Math.min(100, (part / whole) * 100) : 100);

function fileStatus(f: FileProgress) {
  if (!f.selected) return { label: 'Skipped', tone: 'neutral' };
  if (f.uploaded >= f.size) return { label: 'On Drive', tone: 'success' };
  if (f.uploaded > 0) return { label: `Uploading ${pct(f.uploaded, f.size).toFixed(0)}%`, tone: 'info' };
  if (f.downloaded >= f.size) return { label: 'Downloaded', tone: 'info' };
  if (f.downloaded > 0) return { label: `Downloading ${pct(f.downloaded, f.size).toFixed(0)}%`, tone: 'accent' };
  return { label: 'Waiting', tone: 'neutral' };
}

// Chosen files first, then by path, so the interesting rows are on top.
const order = (a: FileProgress, b: FileProgress) => Number(b.selected) - Number(a.selected) || a.path.localeCompare(b.path);

export default function FileProgressList({ torrentId, live }: { torrentId: string; live: boolean }) {
  const { data, isPending, error } = useQuery({
    queryKey: keys.files(torrentId),
    queryFn: () => torrentAPI.getFiles(torrentId),
    refetchInterval: live ? 2000 : false,
  });

  if (isPending) return <p className="muted file-list-note">Loading files…</p>;
  if (error) return <p className="tone-danger file-list-note">{error.message}</p>;
  if (!data.length) return <p className="muted file-list-note">No file list yet. Metadata is still loading.</p>;

  return (
    <ul className="file-list">
      {[...data].sort(order).map((f) => {
        const status = fileStatus(f);
        return (
          <li key={f.index} className={`file-item${f.selected ? '' : ' is-skipped'}`}>
            <div className="file-item-head">
              <span className="file-item-name" title={f.path}>{f.path}</span>
              <span className={`file-item-status tone-${status.tone}`}>{status.label}</span>
            </div>
            {f.selected ? (
              <>
                <div className="file-bar" aria-hidden="true">
                  <span className="file-bar-down" style={{ '--value': `${pct(f.downloaded, f.size)}%` }} />
                  <span className="file-bar-drive" style={{ '--value': `${pct(f.uploaded, f.size)}%` }} />
                </div>
                <p className="file-item-meta num">
                  {formatBytes(f.downloaded)} of {formatBytes(f.size)} downloaded · {formatBytes(f.uploaded)} on Drive
                </p>
              </>
            ) : (
              <p className="file-item-meta num">{formatBytes(f.size)}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
