import { useEffect, useId, useRef, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsAPI, storageAPI } from '../../services/api';
import { keys } from '../../lib/queryClient';
import { useUi } from '../../stores/ui';
import Icon from '../ui/Icon';

// Browse Drive folders and save one as the upload folder.
export default function FolderPicker() {
  const { pickerPath, closePicker, pickerEnter, pickerGoTo } = useUi();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const qc = useQueryClient();
  const current = pickerPath?.at(-1);

  useEffect(() => {
    const d = ref.current;
    if (pickerPath && d && !d.open) d.showModal();
    if (!pickerPath && d?.open) d.close();
  }, [pickerPath]);

  const { data, isPending, error } = useQuery({
    queryKey: [...keys.driveFiles(current?.id), 'folders'],
    queryFn: () => storageAPI.listFolders(current?.id),
    enabled: !!current,
  });
  const folders = (data ?? []).filter((f) => f.is_folder);

  const create = useMutation({
    mutationFn: (name: string) => storageAPI.createFolder(name, current?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.driveFiles(current?.id) }),
  });
  const choose = useMutation({
    mutationFn: () => settingsAPI.update({ shared_folder_id: current?.id ?? 'root' }),
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      qc.invalidateQueries({ queryKey: ['drive'] });
      closePicker();
    },
  });

  const onCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = new FormData(form).get('name');
    if (typeof name === 'string' && name.trim()) create.mutate(name.trim(), { onSuccess: () => form.reset() });
  };
  const failure = error?.message ?? create.error?.message ?? choose.error?.message;

  return (
    <dialog ref={ref} className="dialog folder-picker" aria-labelledby={titleId} onClose={closePicker}>
      <div className="dialog-body">
        <h2 id={titleId}>Choose upload folder</h2>
        <nav className="crumbs" aria-label="Folder path">
          <ol>
            {pickerPath?.map((c, i) => (
              <li key={c.id ?? 'root'}>
                {i === pickerPath.length - 1 ? (
                  <span className="crumb-current" aria-current="location">{c.name}</span>
                ) : (
                  <>
                    <button type="button" className="crumb-link" onClick={() => pickerGoTo(i)}>{c.name}</button>
                    <Icon name="chevron" />
                  </>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <ul className="folder-list" aria-busy={isPending}>
          {isPending && <li className="folder-note">Loading folders…</li>}
          {!isPending && !folders.length && (
            <li className="folder-note">
              <Icon name="folder" />
              <strong>No folders in here</strong>
              <span>Make one below, or upload here.</span>
            </li>
          )}
          {folders.map((f) => (
            <li key={f.id}>
              <button type="button" className="folder-item" onClick={() => pickerEnter({ id: f.id, name: f.name })}>
                <Icon name="folder" /> <span className="truncate">{f.name}</span> <Icon name="chevron" />
              </button>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={onCreate}>
          <input name="name" className="input" placeholder={`New folder in ${current?.name ?? "My Drive"}`} aria-label="New folder name" maxLength={200} />
          <button type="submit" className="btn btn-secondary" disabled={create.isPending}>
            <Icon name="plus" /> {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
        {failure && <p className="status error" role="alert">{failure}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={closePicker}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={choose.isPending} onClick={() => choose.mutate()}>
            {choose.isPending ? 'Saving…' : `Upload to ${current?.name ?? 'My Drive'}`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
