import { useSettingsForm } from '../hooks/useSettingsForm';
import { FIELDS, type FieldKey } from '../lib/settingsFields';
import PageHeader from './ui/PageHeader';
import './SettingsPage.css';

interface ToggleProps {
  id: string;
  labelledBy: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ id, labelledBy, checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-labelledby={labelledBy}
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

interface NumberRowProps {
  name: FieldKey;
  label: string;
  hint: string;
  value: number | string;
  onChange: (name: FieldKey, value: string) => void;
  disabled?: boolean;
}

function NumberRow({ name, label, hint, value, onChange, disabled }: NumberRowProps) {
  const f: { min: number; step: number; unit: string; zero?: string } = FIELDS[name];
  const unlimited = !!f.zero && Number(value) === 0;
  return (
    <div className="setting-row">
      <label htmlFor={name} className="setting-text">
        <span className="setting-label">{label}</span>
        <span className="setting-hint">{hint}</span>
      </label>
      <div className="number-field">
        <input
          id={name}
          type="number"
          inputMode="decimal"
          min={f.min}
          step={f.step}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(name, e.target.value)}
        />
        <span className="unit">{unlimited ? f.zero : f.unit}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { draft, dirty, set, save, discard, status, loadStatus } = useSettingsForm();

  if (!draft) {
    return (
      <main className="page page--narrow">
        <PageHeader title="Settings" subtitle={<span className={`status ${loadStatus.kind}`} role="status">{loadStatus.text || 'Loading settings…'}</span>} />
      </main>
    );
  }

  const locked = (env: string) => draft.env_locked?.includes(env);
  const peakGb = (Number(draft.stream_buffer_mb) + Number(draft.chunk_size) / 1024).toFixed(2);

  return (
    <main className="page page--narrow settings-page">
      <PageHeader
        title="Settings"
        subtitle={<>Uploading to Drive folder <code>{draft.drive_folder_id || 'not set'}</code></>}
      />

      <section className="settings-section" aria-labelledby="sec-stream">
        <h2 id="sec-stream">Stream to Drive</h2>
        <div className="setting-row">
          <label htmlFor="stream_to_drive" className="setting-text">
            <span className="setting-label" id="stream_to_drive-label">Stream instead of download-then-upload</span>
            <span className="setting-hint">
              Fetches pieces in order and uploads each finished chunk, then frees it from disk. Use it when the
              torrent is bigger than your free space. Slower on swarms with rare pieces.
            </span>
          </label>
          <Toggle
            id="stream_to_drive"
            labelledBy="stream_to_drive-label"
            checked={!!draft.stream_to_drive}
            disabled={locked('STREAM_TO_DRIVE')}
            onChange={(v) => set('stream_to_drive', v)}
          />
        </div>
        <NumberRow
          name="stream_buffer_mb"
          label="Download-ahead buffer"
          hint="Torrent data allowed on disk ahead of the upload. Bigger keeps peers busy; smaller saves space."
          value={draft.stream_buffer_mb}
          disabled={!draft.stream_to_drive || locked('STREAM_BUFFER_MB')}
          onChange={set}
        />
        {draft.stream_to_drive && (
          <p className="estimate">
            Peak local disk per torrent ≈ <strong>{peakGb} GB</strong>
          </p>
        )}
        {draft.env_locked.length > 0 && (
          <p className="estimate">
            Set by environment variable, edit <code>.env</code> to change: {draft.env_locked.join(', ')}
          </p>
        )}
      </section>

      <section className="settings-section" aria-labelledby="sec-dl">
        <h2 id="sec-dl">Downloads</h2>
        <NumberRow name="max_concurrent_downloads" label="Parallel torrents" hint="Torrents downloading at the same time. The rest wait in the queue." value={draft.max_concurrent_downloads} onChange={set} />
        <NumberRow name="max_connections" label="Connection limit" hint="Total peer connections across all torrents." value={draft.max_connections} onChange={set} />
        <NumberRow name="download_rate_limit" label="Download speed cap" hint="0 means no cap." value={draft.download_rate_limit} onChange={set} />
        <NumberRow name="upload_rate_limit" label="Upload speed cap" hint="Seeding speed. 0 means no cap. Streamed torrents never seed." value={draft.upload_rate_limit} onChange={set} />
      </section>

      <section className="settings-section" aria-labelledby="sec-trackers">
        <h2 id="sec-trackers">Trackers</h2>
        <div className="setting-row setting-row--stack">
          <label htmlFor="extra_trackers" className="setting-text">
            <span className="setting-label">Add these trackers to new torrents</span>
            <span className="setting-hint">One URL per line (udp://, http://, https://). More trackers find more peers, so slow torrents speed up.</span>
          </label>
          <textarea
            id="extra_trackers"
            className="input tracker-list"
            rows={6}
            spellCheck={false}
            placeholder="udp://tracker.opentrackr.org:1337/announce"
            value={(draft.extra_trackers ?? []).join('\n')}
            onChange={(e) => set('extra_trackers', e.target.value.split('\n'))}
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="sec-drive">
        <h2 id="sec-drive">Drive upload</h2>
        <NumberRow name="chunk_size" label="Upload chunk size" hint="Rounded down to a multiple of 0.25 MB, as Drive requires. Larger chunks mean fewer requests." value={draft.chunk_size} onChange={set} />
        <NumberRow name="max_retries" label="Retries per chunk" hint="Attempts before an upload is marked failed. Waits double after each try." value={draft.max_retries} onChange={set} />
      </section>

      <footer className="save-bar" hidden={!dirty && status.kind === 'idle'}>
        <p className={`status ${status.kind}`} role="status" aria-live="polite">
          {status.text || (dirty ? 'Unsaved changes' : 'All changes saved')}
        </p>
        <div className="save-actions">
          <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={discard}>
            Discard
          </button>
          <button type="button" className="btn btn-primary" disabled={!dirty || status.kind === 'saving'} onClick={save}>
            Save settings
          </button>
        </div>
      </footer>
    </main>
  );
}
