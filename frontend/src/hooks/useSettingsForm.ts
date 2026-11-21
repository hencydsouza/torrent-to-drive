import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '../lib/queryClient';
import { settingsAPI } from '../services/api';
import { toApi, toView, type SettingsDraft } from '../lib/settingsFields';
import { useSettingsEdits } from '../stores/settingsDraft';

export type StatusKind = 'idle' | 'saving' | 'ok' | 'error';
export interface Status {
  kind: StatusKind;
  text: string;
}

// Server settings (query) + unsaved edits (zustand) + save mutation. Status is derived, not stored.
export function useSettingsForm() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: keys.settings, queryFn: () => settingsAPI.get(), select: toView });
  const { edits, setField, clear } = useSettingsEdits();
  const saved = query.data ?? null;
  const draft: SettingsDraft | null = saved && { ...saved, ...edits };

  const mutation = useMutation({
    mutationFn: (values: SettingsDraft) => settingsAPI.update(toApi(values)),
    onSuccess: (data) => {
      qc.setQueryData(keys.settings, data);
      clear();
    },
  });

  const status: Status = mutation.isPending
    ? { kind: 'saving', text: 'Saving…' }
    : mutation.isError
      ? { kind: 'error', text: mutation.error.message }
      : mutation.isSuccess
        ? { kind: 'ok', text: 'Saved. Applies to new downloads; rate limits apply now.' }
        : { kind: 'idle', text: '' };
  const loadStatus: Status = query.isError ? { kind: 'error', text: `${query.error.message}. Is the backend running?` } : status;

  const dirty = saved && draft && JSON.stringify(toApi(saved)) !== JSON.stringify(toApi(draft));

  const set = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => {
    setField(k, v);
    if (!mutation.isPending) mutation.reset(); // clear the last save message once editing resumes
  };

  return { saved, draft, dirty, set, save: () => draft && mutation.mutate(draft), discard: clear, status, loadStatus };
}
