import { useState, useEffect } from 'react';
import { storageAPI } from '../services/api';
import './StoragePage.css';

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const formatDate = (dateString) => {
  if (!dateString) return '--';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getFileIcon = (file) => {
  if (file.is_folder) return '📁';
  const mimeType = file.mime_type || '';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return '📦';
  if (mimeType.includes('pdf')) return '📕';
  return '📄';
};

export default function StoragePage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    loadFiles();
    checkHealth();
  }, []);

  const loadFiles = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await storageAPI.listFiles();
      setFiles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkHealth = async () => {
    try {
      const data = await storageAPI.checkHealth();
      setHealth(data);
    } catch (err) {
      console.error('Health check failed:', err);
      setHealth({ status: 'error' });
    }
  };

  const handleDownload = (file) => {
    if (file.web_content_link) {
      window.open(file.web_content_link, '_blank');
    } else if (file.web_view_link) {
      window.open(file.web_view_link, '_blank');
    } else {
      alert('Download link not available for this file');
    }
  };

  return (
    <div className="storage-page">
      <div className="page-header">
        <h1>☁️ Google Drive Storage</h1>
        <div className="header-actions">
          {health && (
            <span className={`health-badge ${health.status === 'healthy' ? 'healthy' : 'error'}`}>
              <span className="health-dot"></span>
              {health.status === 'healthy' ? 'Connected' : 'Disconnected'}
            </span>
          )}
          <button onClick={loadFiles} disabled={loading} className="btn btn-secondary">
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="glass-card">
        {loading && files.length === 0 ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading files from Google Drive...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">☁️</span>
            <p>No files uploaded yet.</p>
            <p className="empty-hint">Download torrents from the Torrents page to see them here.</p>
          </div>
        ) : (
          <>
            <div className="file-count">
              {files.length} file{files.length !== 1 ? 's' : ''} in Google Drive
            </div>

            <table className="storage-table">
              <thead>
                <tr>
                  <th className="col-name">Name</th>
                  <th className="col-type">Type</th>
                  <th className="col-size">Size</th>
                  <th className="col-date">Created</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id}>
                    <td className="col-name">
                      <div className="file-name">
                        <span className="file-icon">{getFileIcon(file)}</span>
                        <span className="file-text" title={file.name}>{file.name}</span>
                      </div>
                    </td>
                    <td className="col-type">
                      {file.is_folder ? 'Folder' : (file.mime_type || '').split('/').pop().toUpperCase()}
                    </td>
                    <td className="col-size">
                      {!file.is_folder && formatBytes(file.size)}
                    </td>
                    <td className="col-date">
                      {formatDate(file.created_time)}
                    </td>
                    <td className="col-actions">
                      <button onClick={() => handleDownload(file)} className="btn btn-small btn-primary">
                        {file.is_folder ? '📂 Open' : '⬇️ Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
