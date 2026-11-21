import type { AppSettings, SettingsUpdate } from '../types';

const MB = 1024 * 1024;

interface Field {
  scale: number; // multiplies the shown value into the stored value
  unit: string;
  step: number;
  min: number;
  zero?: string; // label shown instead of the unit when the value is 0
}

// UI unit <-> API bytes.
export const FIELDS = {
  stream_buffer_mb: { scale: 1024, unit: 'GB', step: 0.25, min: 0.25 },
  max_concurrent_downloads: { scale: 1, unit: 'torrents', step: 1, min: 1 },
  max_connections: { scale: 1, unit: 'peers', step: 10, min: 10 },
  download_rate_limit: { scale: MB, unit: 'MB/s', step: 0.5, min: 0, zero: 'Unlimited' },
  upload_rate_limit: { scale: MB, unit: 'MB/s', step: 0.5, min: 0, zero: 'Unlimited' },
  chunk_size: { scale: MB, unit: 'MB', step: 0.25, min: 0.25 },
  max_retries: { scale: 1, unit: 'attempts', step: 1, min: 1 },
} satisfies Record<string, Field>;

export type FieldKey = keyof typeof FIELDS;

// Form state: numeric fields hold the raw input text while editing.
export type SettingsDraft = { [K in keyof AppSettings]: K extends FieldKey ? number | string : AppSettings[K] };

const field = (k: string): Field | undefined => (FIELDS as Record<string, Field>)[k];

export const toView = (api: AppSettings): SettingsDraft =>
  Object.fromEntries(
    Object.entries(api).map(([k, v]) => {
      const f = field(k);
      return [k, f ? +((v as number) / f.scale).toFixed(2) : v];
    }),
  ) as SettingsDraft;

export const toApi = (view: SettingsDraft): SettingsUpdate =>
  Object.fromEntries(
    Object.entries(view)
      .filter(([k]) => field(k) || k === 'stream_to_drive')
      .map(([k, v]) => {
        const f = field(k);
        return [k, f ? Math.round(Number(v) * f.scale) : v];
      }),
  ) as SettingsUpdate;
