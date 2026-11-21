import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import TorrentPage from './components/TorrentPage';
import StoragePage from './components/StoragePage';
import SettingsPage from './components/SettingsPage';
import type { ReactElement } from 'react';
import Icon, { type IconName } from './components/ui/Icon';

const ROUTES: { path: string; label: string; icon: IconName; element: ReactElement }[] = [
  { path: '/', label: 'Torrents', icon: 'download', element: <TorrentPage /> },
  { path: '/storage', label: 'Drive', icon: 'cloud', element: <StoragePage /> },
  { path: '/settings', label: 'Settings', icon: 'settings', element: <SettingsPage /> },
];

function Navigation() {
  return (
    <nav className="app-nav" aria-label="Main">
      <div className="app-brand">
        <Icon name="logo" size={20} />
        <span className="app-brand-text">Torrent-to-Drive</span>
      </div>
      {ROUTES.map(({ path, label, icon }) => (
        <NavLink key={path} to={path} end className="nav-tab">
          <Icon name={icon} /> {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        {ROUTES.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
      </Routes>
    </BrowserRouter>
  );
}
