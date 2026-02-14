import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import TorrentPage from './components/TorrentPage';
import StoragePage from './components/StoragePage';

function Navigation() {
  const location = useLocation();

  const navStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.8))',
    backdropFilter: 'blur(20px)',
    padding: '0 20px',
    margin: 0,
    listStyle: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  };

  const logoStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '15px 20px 15px 0',
    marginRight: '20px',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
  };

  const logoText = {
    fontSize: '18px',
    fontWeight: '700',
    background: 'linear-gradient(135deg, #2dd4bf, #14b8a6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const linkStyle = (isActive) => ({
    padding: '18px 24px',
    color: isActive ? '#2dd4bf' : 'rgba(255, 255, 255, 0.7)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderBottom: isActive ? '2px solid #2dd4bf' : '2px solid transparent',
    transition: 'all 0.2s',
    marginBottom: '-1px',
  });

  return (
    <nav style={navStyle}>
      <div style={logoStyle}>
        <span style={{ fontSize: '24px' }}>⚡</span>
        <span style={logoText}>Torrent-to-Drive</span>
      </div>
      <Link to="/" style={linkStyle(location.pathname === '/')}>
        📥 Torrents
      </Link>
      <Link to="/storage" style={linkStyle(location.pathname === '/storage')}>
        ☁️ Storage
      </Link>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh' }}>
        <Navigation />
        <Routes>
          <Route path="/" element={<TorrentPage />} />
          <Route path="/storage" element={<StoragePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
