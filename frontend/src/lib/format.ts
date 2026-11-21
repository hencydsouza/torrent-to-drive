const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export const formatBytes = (bytes?: number | null): string => {
  if (!bytes) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 || value >= 100 ? 0 : 1)} ${UNITS[i]}`;
};

export const formatSpeed = (bytesPerSec?: number | null) => `${formatBytes(bytesPerSec)}/s`;

export const formatDuration = (seconds?: number | null): string | null => {
  if (!seconds || seconds < 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (value?: string | null) => (value ? dateFmt.format(new Date(value)) : '--');
