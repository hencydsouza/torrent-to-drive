// One stroke icon set (24px grid, 1.75 stroke) so every glyph shares weight and style.
const PATHS = {
  logo: 'M4 6h16M4 12h10M4 18h6M17 14v7m0 0-3-3m3 3 3-3',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  upload: 'M12 20V9m0 0-4 4m4-4 4 4M5 4h14',
  cloud: 'M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.3 9 4.5 4.5 0 0 1 17 18H7Z',
  settings: 'M4 7h10m4 0h2M4 17h4m4 0h8M14 5v4M8 15v4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  folderOpen: 'M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h12.5l3.5-8H7.5L4 19',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5',
  video: 'M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm12 4 5-3v10l-5-3',
  audio: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  image: 'M4 5h16v14H4V5Zm0 11 4-4 3 3 3-3 6 6M15.5 9.5h.01',
  archive: 'M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Zm-1-3h18v3H3V4Zm7 7h4',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 4.5v15L19 12 7 4.5Z',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  alert: 'M12 9v4m0 4h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z',
  clipboard: 'M9 4h6v3H9V4Zm-2 1H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1',
  copy: 'M9 9h10v11H9V9Zm-4 6V5a1 1 0 0 1 1-1h9',
  chevron: 'M9 6l6 6-6 6',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2-8Z',
};

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  label?: string;
}

export default function Icon({ name, size = 16, className = '', label }: IconProps) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

// Busy indicator that keeps the button width stable.
export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ '--spinner-size': `${size}px` }} aria-hidden="true" />;
}
