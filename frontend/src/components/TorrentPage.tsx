import { useEffect } from 'react';
import Icon from './ui/Icon';
import Alert from './ui/Alert';
import EmptyState from './ui/EmptyState';
import PageHeader from './ui/PageHeader';
import ConfirmDialog from './ui/ConfirmDialog';
import StatsBar from './torrents/StatsBar';
import FilterTabs from './torrents/FilterTabs';
import AddTorrentForm from './torrents/AddTorrentForm';
import TorrentRow from './torrents/TorrentRow';
import { useTorrents } from '../hooks/useTorrents';
import { useShortcuts } from '../hooks/useShortcuts';
import { useAddTorrent } from '../stores/addTorrent';
import { useUi } from '../stores/ui';
import { matchesFilter } from '../lib/torrentState';
import { formatSpeed } from '../lib/format';
import './TorrentPage.css';

const TITLE = 'Torrent to Drive';

export default function TorrentPage() {
  const { torrents, progressById, stats, busyById, error, clearError, pause, resume, remove } = useTorrents();
  const adding = useAddTorrent((s) => s.open);
  const setAdding = useAddTorrent((s) => s.setOpen);
  const { filter, setFilter, pendingDelete, setPendingDelete } = useUi();
  const visible = torrents.filter((t) => matchesFilter(t.state, filter));

  useShortcuts({ n: () => setAdding(true), Escape: () => !pendingDelete && setAdding(false) });

  // Live speed in the tab title so progress is visible from other tabs.
  const rate = stats.active_torrents ? stats.total_download_rate : 0;
  useEffect(() => {
    document.title = rate ? `↓ ${formatSpeed(rate)} · ${TITLE}` : TITLE;
    return () => {
      document.title = TITLE;
    };
  }, [rate]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    remove(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <main className="page">
      <PageHeader title="Torrents" subtitle={<StatsBar stats={stats} />}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
          aria-keyshortcuts={adding ? 'Escape' : 'n'}
          title={adding ? 'Close (Esc)' : 'Add torrent (N)'}
        >
          <Icon name={adding ? 'close' : 'plus'} />
          {adding ? 'Close' : 'Add torrent'}
        </button>
      </PageHeader>

      {adding && <AddTorrentForm />}
      {error ? <Alert onDismiss={clearError}>{error}</Alert> : null}

      {torrents.length > 0 && <FilterTabs torrents={torrents} value={filter} onChange={setFilter} />}

      <section className="card card--flush" aria-label="Torrent list">
        {torrents.length === 0 ? (
          <EmptyState icon="inbox" title="Nothing downloading" hint="Add a magnet link and its files go straight to your Drive folder. Press N any time.">
            {!adding && (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <Icon name="plus" /> Add torrent
              </button>
            )}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon="inbox" title="No torrents in this view">
            <button type="button" className="btn btn-ghost" onClick={() => setFilter('all')}>Show all</button>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table torrent-table">
              <thead>
                <tr>
                  <th>Torrent</th>
                  <th className="col-size">Size</th>
                  <th className="col-date">Added</th>
                  <th className="col-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((torrent) => (
                  <TorrentRow
                    key={torrent.id}
                    torrent={torrent}
                    progress={progressById[torrent.id] || torrent.progress}
                    busy={busyById[torrent.id]}
                    onPause={pause}
                    onResume={resume}
                    onDelete={setPendingDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this torrent?"
        message={`"${pendingDelete?.metadata?.name || 'This torrent'}" and its local files will be removed. Files already on Drive stay.`}
        confirmLabel="Delete torrent"
        cancelLabel="Keep it"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  );
}
