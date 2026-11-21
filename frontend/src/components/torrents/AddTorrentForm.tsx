import { useEffect, useRef, type ClipboardEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keys } from '../../lib/queryClient';
import Icon, { Spinner } from '../ui/Icon';
import Alert from '../ui/Alert';
import FileSelection from './FileSelection';
import { torrentAPI } from '../../services/api';
import { useAddTorrent } from '../../stores/addTorrent';

const isMagnet = (s: string) => s.trim().startsWith('magnet:');
const BAD_LINK = 'That does not look like a magnet link. It should start with "magnet:".';

// Magnet -> metadata (react-query) -> file selection -> start. Draft text lives in zustand.
export default function AddTorrentForm() {
  const { magnet, submitted, setMagnet, submit: ask } = useAddTorrent();
  const valid = isMagnet(submitted);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []); // user just opened the form

  const read = useQuery({
    queryKey: keys.metadata(submitted),
    queryFn: () => torrentAPI.fetchMetadata(submitted),
    enabled: valid,
    staleTime: Infinity, // a magnet's file list never changes
    retry: false,
  });
  const reading = read.isFetching;
  const error = submitted && !valid ? BAD_LINK : read.error?.message;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (magnet.trim() === submitted && read.isError) read.refetch();
    else ask(magnet);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    if (!isMagnet(text) || magnet) return;
    e.preventDefault();
    ask(text); // pasting a magnet into an empty box reads it straight away
  };
  const pasteFromClipboard = async () => {
    const text = (await navigator.clipboard.readText().catch(() => '')).trim();
    if (text) ask(text);
  };

  return (
    <section className="card add-torrent" aria-label="Add torrent">
      <form className="input-row" onSubmit={submit}>
        <input
          ref={inputRef}
          className="input"
          type="text"
          placeholder="magnet:?xt=urn:btih:…"
          aria-label="Magnet link"
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          onPaste={onPaste}
        />
        {!magnet && 'clipboard' in navigator ? (
          <button type="button" className="btn btn-secondary" onClick={pasteFromClipboard}>
            <Icon name="clipboard" /> Paste
          </button>
        ) : null}
        <button type="submit" className="btn btn-secondary" disabled={reading || !magnet.trim()}>
          {reading ? <Spinner /> : <Icon name="search" />} Read files
        </button>
      </form>
      {reading ? <p className="muted add-hint">Asking peers for the file list. This can take up to a minute.</p> : null}
      {error ? <Alert onDismiss={() => ask('')}>{error}</Alert> : null}
      {read.data ? <FileSelection magnet={submitted} metadata={read.data} /> : null}
    </section>
  );
}
