import { useState, useEffect, useCallback } from 'react';
import { torrentAPI, WebSocketClient } from '../services/api';
import './TorrentPage.css';

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec) return '0 B/s';
  return formatBytes(bytesPerSec) + '/s';
};

const formatTime = (seconds) => {
  if (!seconds || seconds < 0) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Build tree structure from flat file list
const buildFileTree = (files) => {
  const root = { name: 'root', children: {}, files: [], isFolder: true };
  files.forEach(file => {
    const parts = file.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      if (!current.children[folderName]) {
        current.children[folderName] = { name: folderName, children: {}, files: [], isFolder: true };
      }
      current = current.children[folderName];
    }
    current.files.push(file);
  });
  return root;
};

// Recursive folder component
function FolderTree({ node, selectedFiles, toggleFileSelection, level = 0 }) {
  const [expanded, setExpanded] = useState(level === 0);

  return (
    <div style={{ marginLeft: level * 16 + 'px' }}>
      {level > 0 && (
        <div onClick={() => setExpanded(!expanded)} className="folder-item">
          <span className="folder-icon">{expanded ? '📂' : '📁'}</span>
          <span className="folder-name">{node.name}</span>
        </div>
      )}
      {expanded && (
        <>
          {Object.values(node.children).map((child, idx) => (
            <FolderTree key={idx} node={child} selectedFiles={selectedFiles} toggleFileSelection={toggleFileSelection} level={level + 1} />
          ))}
          {node.files.map(file => (
            <div key={file.index} className="file-item" style={{ marginLeft: (level + 1) * 16 + 'px' }}>
              <label className="file-label">
                <input type="checkbox" checked={selectedFiles.has(file.index)} onChange={() => toggleFileSelection(file.index)} />
                <span className="file-name">📄 {file.path.split('/').pop()}</span>
                <span className="file-size">{formatBytes(file.size)}</span>
              </label>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Confirmation Modal
function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// Server Stats Banner
function ServerStats({ stats }) {
  return (
    <div className="server-stats">
      <div className="stat-item">
        <span className="stat-icon">⬇️</span>
        <span className="stat-value download">{formatSpeed(stats.total_download_rate)}</span>
      </div>
      <div className="stat-item">
        <span className="stat-icon">⬆️</span>
        <span className="stat-value upload">{formatSpeed(stats.total_upload_rate)}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Active:</span>
        <span className="stat-value">{stats.active_torrents || 0}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Peers:</span>
        <span className="stat-value">{stats.total_peers || 0}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Seeds:</span>
        <span className="stat-value">{stats.total_seeds || 0}</span>
      </div>
    </div>
  );
}

export default function TorrentPage() {
  const [magnetUrl, setMagnetUrl] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [torrents, setTorrents] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [serverStats, setServerStats] = useState({});
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, torrentId: null, torrentName: '' });
  const [showAddForm, setShowAddForm] = useState(false);

  const loadTorrents = useCallback(async () => {
    try {
      const data = await torrentAPI.listTorrents();
      setTorrents(data);
    } catch (err) {
      console.error('Error loading torrents:', err);
    }
  }, []);

  useEffect(() => {
    loadTorrents();

    const ws = new WebSocketClient((message) => {
      if (message.type === 'progress') {
        setProgressMap(prev => ({ ...prev, [message.torrent_id]: message.data }));
      } else if (message.type === 'stats') {
        setServerStats(message.data);
      }
    });
    ws.connect();

    const interval = setInterval(loadTorrents, 5000);

    return () => {
      ws.disconnect();
      clearInterval(interval);
    };
  }, [loadTorrents]);

  const handleFetchMetadata = async () => {
    if (!magnetUrl.trim()) {
      setError('Please enter a magnet URL');
      return;
    }
    setLoading(true);
    setError('');
    setMetadata(null);

    try {
      const data = await torrentAPI.fetchMetadata(magnetUrl);
      setMetadata(data);
      setSelectedFiles(new Set(data.files.map(f => f.index)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDownload = async () => {
    if (!metadata) return;
    setLoading(true);
    setError('');

    try {
      const torrent = await torrentAPI.addTorrent(magnetUrl);
      await torrentAPI.startDownload(torrent.id, selectedFiles.size > 0 ? Array.from(selectedFiles) : null);
      setMetadata(null);
      setMagnetUrl('');
      setSelectedFiles(new Set());
      setShowAddForm(false);
      await loadTorrents();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async (torrentId) => {
    setActionLoading(prev => ({ ...prev, [torrentId]: 'pause' }));
    try {
      await torrentAPI.pauseTorrent(torrentId);
      await loadTorrents();
    } catch (err) {
      console.error('Error pausing:', err);
    } finally {
      setActionLoading(prev => ({ ...prev, [torrentId]: null }));
    }
  };

  const handleResume = async (torrentId) => {
    setActionLoading(prev => ({ ...prev, [torrentId]: 'resume' }));
    try {
      await torrentAPI.resumeTorrent(torrentId);
      await loadTorrents();
    } catch (err) {
      console.error('Error resuming:', err);
    } finally {
      setActionLoading(prev => ({ ...prev, [torrentId]: null }));
    }
  };

  const handleDelete = async (confirmed = false) => {
    if (!confirmed) return;
    
    const { torrentId } = deleteModal;
    setActionLoading(prev => ({ ...prev, [torrentId]: 'delete' }));
    setDeleteModal({ isOpen: false, torrentId: null, torrentName: '' });
    
    try {
      await torrentAPI.deleteTorrent(torrentId, true);
      await loadTorrents();
    } catch (err) {
      console.error('Error deleting:', err);
    } finally {
      setActionLoading(prev => ({ ...prev, [torrentId]: null }));
    }
  };

  const openDeleteModal = (torrentId, torrentName) => {
    setDeleteModal({ isOpen: true, torrentId, torrentName });
  };

  const toggleFileSelection = (index) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedFiles(newSelection);
  };

  const selectAll = () => setSelectedFiles(new Set(metadata.files.map(f => f.index)));
  const deselectAll = () => setSelectedFiles(new Set());

  const fileTree = metadata ? buildFileTree(metadata.files) : null;

  const getStateClass = (state) => {
    const stateMap = {
      downloading: 'state-downloading',
      uploading: 'state-uploading',
      completed: 'state-completed',
      uploaded: 'state-completed',
      paused: 'state-paused',
      error: 'state-error',
      metadata_ready: 'state-pending',
      fetching_metadata: 'state-pending',
    };
    return stateMap[state] || 'state-pending';
  };

  return (
    <div className="torrent-page">
      <ServerStats stats={serverStats} />

      <div className="page-header">
        <h1>Torrents</h1>
        <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? '✕ Close' : '+ Add Torrent'}
        </button>
      </div>

      {/* Add Torrent Form */}
      {showAddForm && (
        <div className="glass-card add-torrent-section">
          <div className="input-group">
            <input
              type="text"
              placeholder="Paste magnet URL here..."
              value={magnetUrl}
              onChange={(e) => setMagnetUrl(e.target.value)}
              className="input-field"
            />
            <button onClick={handleFetchMetadata} disabled={loading} className="btn btn-primary">
              {loading ? '⏳' : '🔍'} Fetch
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          {metadata && (
            <div className="metadata-section">
              <div className="metadata-header">
                <h3>{metadata.name}</h3>
                <span className="metadata-info">{formatBytes(metadata.total_size)} • {metadata.num_files} files</span>
              </div>

              <div className="file-selection-controls">
                <button onClick={selectAll} className="btn btn-small btn-secondary">Select All</button>
                <button onClick={deselectAll} className="btn btn-small btn-secondary">Deselect All</button>
                <span className="selection-count">{selectedFiles.size} / {metadata.num_files} selected</span>
              </div>

              <div className="file-tree-container">
                {fileTree && (
                  <FolderTree node={fileTree} selectedFiles={selectedFiles} toggleFileSelection={toggleFileSelection} />
                )}
              </div>

              <button
                onClick={handleStartDownload}
                disabled={selectedFiles.size === 0 || loading}
                className="btn btn-success btn-full"
              >
                ⬇️ Start Download ({selectedFiles.size} files)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Torrent Table */}
      <div className="glass-card torrent-table-container">
        {torrents.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📥</span>
            <p>No torrents yet. Add one to get started.</p>
          </div>
        ) : (
          <table className="torrent-table">
            <thead>
              <tr>
                <th className="col-name">Name</th>
                <th className="col-size">Size</th>
                <th className="col-progress">Progress</th>
                <th className="col-speed">↓ Speed</th>
                <th className="col-speed">↑ Speed</th>
                <th className="col-peers">Peers</th>
                <th className="col-eta">ETA</th>
                <th className="col-date">Added</th>
                <th className="col-status">Status</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map(torrent => {
                const progress = progressMap[torrent.id] || torrent.progress || {};
                const isDownloading = torrent.state === 'downloading';
                const isPaused = torrent.state === 'paused';
                const isCompleted = torrent.state === 'completed' || torrent.state === 'uploaded';
                const progressPercent = progress.progress || 0;
                const isLoading = actionLoading[torrent.id];

                return (
                  <tr key={torrent.id} className={getStateClass(torrent.state)}>
                    <td className="col-name">
                      <div className="torrent-name" title={torrent.metadata?.name}>
                        {torrent.metadata?.name || 'Loading...'}
                      </div>
                      {progress.error && <div className="torrent-error">{progress.error}</div>}
                    </td>
                    <td className="col-size">{formatBytes(torrent.metadata?.total_size)}</td>
                    <td className="col-progress">
                      <div className="progress-cell">
                        <div className="progress-bar">
                          <div 
                            className="progress-fill" 
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="progress-text">{progressPercent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="col-speed download">{isDownloading ? formatSpeed(progress.download_rate) : '--'}</td>
                    <td className="col-speed upload">{isDownloading ? formatSpeed(progress.upload_rate) : '--'}</td>
                    <td className="col-peers">
                      {isDownloading ? `${progress.num_peers || 0}/${progress.num_seeds || 0}` : '--'}
                    </td>
                    <td className="col-eta">{isDownloading ? formatTime(progress.eta) : '--'}</td>
                    <td className="col-date">{formatDate(torrent.created_at)}</td>
                    <td className="col-status">
                      <span className={`status-badge ${getStateClass(torrent.state)}`}>
                        {torrent.state.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="action-buttons">
                        {isDownloading && (
                          <button
                            onClick={() => handlePause(torrent.id)}
                            disabled={isLoading}
                            className="btn-icon btn-pause"
                            title="Pause"
                          >
                            {isLoading === 'pause' ? '⏳' : '⏸️'}
                          </button>
                        )}
                        {isPaused && (
                          <button
                            onClick={() => handleResume(torrent.id)}
                            disabled={isLoading}
                            className="btn-icon btn-resume"
                            title="Resume"
                          >
                            {isLoading === 'resume' ? '⏳' : '▶️'}
                          </button>
                        )}
                        {!isDownloading && torrent.state === 'metadata_ready' && (
                          <button
                            onClick={() => handleResume(torrent.id)}
                            disabled={isLoading}
                            className="btn-icon btn-resume"
                            title="Start"
                          >
                            {isLoading === 'resume' ? '⏳' : '▶️'}
                          </button>
                        )}
                        <button
                          onClick={() => openDeleteModal(torrent.id, torrent.metadata?.name)}
                          disabled={isLoading}
                          className="btn-icon btn-delete"
                          title="Delete"
                        >
                          {isLoading === 'delete' ? '⏳' : '🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Delete Torrent"
        message={`Are you sure you want to delete "${deleteModal.torrentName}"? This will also remove downloaded files.`}
        onConfirm={() => handleDelete(true)}
        onCancel={() => setDeleteModal({ isOpen: false, torrentId: null, torrentName: '' })}
      />
    </div>
  );
}
