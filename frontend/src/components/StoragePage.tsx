import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import { storageAPI } from '../services/api';
import { keys } from '../lib/queryClient';
import Icon, { Spinner } from './ui/Icon';
import Alert from './ui/Alert';
import EmptyState from './ui/EmptyState';
import PageHeader from './ui/PageHeader';
import DriveToolbar from './drive/DriveToolbar';
import DriveFileRow from './drive/DriveFileRow';
import { useUi } from '../stores/ui';
import './StoragePage.css';

function HealthBadge() {
  const health = useQuery({ queryKey: keys.driveHealth, queryFn: () => storageAPI.checkHealth() });
  if (!health.isError && !health.data) return null;
  const healthy = !health.isError && health.data?.status === 'healthy';
  return (
    <span className={`badge tone-${healthy ? 'success' : 'danger'}`}>
      <span className="badge-dot" />
      {healthy ? 'Connected to Google Drive' : 'Drive disconnected'}
    </span>
  );
}

export default function StoragePage() {
  const { drivePath, openFolder, driveSearch, setDriveSearch } = useUi();
  const folderId = drivePath[drivePath.length - 1].id;
  const filesQuery = useQuery({ queryKey: keys.driveFiles(folderId), queryFn: () => storageAPI.listFiles(folderId) });
  const all = filesQuery.data ?? [];
  const q = useDeferredValue(driveSearch.trim().toLowerCase());
  const files = q ? all.filter((f) => f.name.toLowerCase().includes(q)) : all;
  const loading = filesQuery.isFetching;

  const body = () => {
    if (loading && all.length === 0) return <EmptyState icon="cloud" title="Loading folder…" />;
    if (all.length === 0) {
      return <EmptyState icon="cloud" title={drivePath.length > 1 ? 'This folder is empty' : 'Your Drive folder is empty'} hint="Finished torrents land here." />;
    }
    if (files.length === 0) {
      return (
        <EmptyState icon="search" title={`Nothing matches "${driveSearch}"`}>
          <button type="button" className="btn btn-ghost" onClick={() => setDriveSearch('')}>Clear filter</button>
        </EmptyState>
      );
    }
    return (
      <div className="table-scroll">
        <table className="data-table storage-table">
          <caption className="sr-only">{files.length} of {all.length} items</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th className="col-type">Type</th>
              <th className="col-size">Size</th>
              <th className="col-date">Created</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <DriveFileRow key={file.id} file={file} onOpen={() => openFolder({ id: file.id, name: file.name })} />
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className="page">
      <PageHeader title="Drive" subtitle={<HealthBadge />}>
        <button type="button" onClick={() => filesQuery.refetch()} disabled={loading} className="btn btn-ghost">
          {loading ? <Spinner /> : <Icon name="refresh" />} Refresh
        </button>
      </PageHeader>

      {filesQuery.error ? <Alert>{filesQuery.error.message}</Alert> : null}
      <DriveToolbar />
      <section className="card card--flush" aria-label="Drive files" aria-busy={loading}>
        {body()}
      </section>
    </main>
  );
}
