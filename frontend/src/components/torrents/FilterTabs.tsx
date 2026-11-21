import { FILTERS, matchesFilter, type TorrentFilter } from '../../lib/torrentState';
import type { TorrentInfo } from '../../types';

interface FilterTabsProps {
  torrents: TorrentInfo[];
  value: TorrentFilter;
  onChange: (f: TorrentFilter) => void;
}

export default function FilterTabs({ torrents, value, onChange }: FilterTabsProps) {
  return (
    <div className="filter-tabs" role="tablist" aria-label="Filter torrents">
      {FILTERS.map(({ id, label }) => {
        const count = torrents.filter((t) => matchesFilter(t.state, id)).length;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={value === id}
            className={`filter-tab${value === id ? ' is-active' : ''}`}
            onClick={() => onChange(id)}
          >
            {label} <span className="filter-count num">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
