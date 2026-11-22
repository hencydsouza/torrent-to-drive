import { useEffect, useId, useRef, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsAPI, storageAPI } from '../../services/api';
import { keys } from '../../lib/queryClient';
import { useUi } from '../../stores/ui';
import Icon from '../ui/Icon';

// Browse Drive folders and save one as the upload folder. drive.file scope only lists folders this app made.
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
    queryKey: keys.driveFiles(current?.id),
    queryFn: () => storageAPI.listFiles(current?.id),
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
          {pickerPath?.map((c, i) => (
            <button key={c.id ?? 'root'} type="button" className="btn btn-ghost btn-small" disabled={i === pickerPath.length - 1} onClick={() => pickerGoTo(i)}>
              {c.name}
            </button>
          ))}
        </nav>
        <ul className="folder-list" aria-busy={isPending}>
          {isPending && <li className="muted">Loading folders…</li>}
          {!isPending && !folders.length && <li className="muted">No folders here that this app created. Make one below.</li>}
          {folders.map((f) => (
            <li key={f.id}>
              <button type="button" className="folder-item" onClick={() => pickerEnter({ id: f.id, name: f.name })}>
                <Icon name="folder" /> <span className="truncate">{f.name}</span> <Icon name="chevron" />
              </button>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={onCreate}>
          <input name="name" className="input" placeholder="New folder name" aria-label="New folder name" maxLength={200} />
          <button type="submit" className="btn btn-secondary" disabled={create.isPending}>
            <Icon name="plus" /> Create
          </button>
        </form>
        {failure && <p className="status error" role="alert">{failure}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={closePicker}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={choose.isPending} onClick={() => choose.mutate()}>
            Upload to “{current?.name}”
          </button>
        </div>
      </div>
    </dialog>
  );
}
