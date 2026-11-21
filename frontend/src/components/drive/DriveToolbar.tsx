import Icon from '../ui/Icon';
import { useUi } from '../../stores/ui';

// Breadcrumb path + name filter for the current Drive folder.
export default function DriveToolbar() {
  const { drivePath, goToCrumb, driveSearch, setDriveSearch } = useUi();
  return (
    <div className="drive-toolbar">
      <nav className="crumbs" aria-label="Folder path">
        {drivePath.map((c, i) => {
          const last = i === drivePath.length - 1;
          return (
            <span key={c.id ?? 'root'} className="crumbs">
              {i > 0 && <Icon name="chevron" size={14} />}
              <button type="button" className="crumb" aria-current={last ? 'page' : undefined} onClick={() => !last && goToCrumb(i)}>
                {c.name}
              </button>
            </span>
          );
        })}
      </nav>
      <input
        className="input drive-search"
        type="search"
        placeholder="Filter this folder"
        aria-label="Filter files in this folder by name"
        value={driveSearch}
        onChange={(e) => setDriveSearch(e.target.value)}
      />
    </div>
  );
}
