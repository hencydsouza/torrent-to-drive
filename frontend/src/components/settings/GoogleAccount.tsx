import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { authAPI } from '../../services/api';
import { keys } from '../../lib/queryClient';
import type { AuthStatus } from '../../types';

function useAuthActions() {
  const qc = useQueryClient();
  const onAuth = (s: AuthStatus) => {
    qc.setQueryData(keys.auth, s);
    qc.invalidateQueries({ queryKey: ['drive'] });
  };
  const upload = useMutation({ mutationFn: (json: string) => authAPI.uploadClient(json), onSuccess: onAuth });
  const login = useMutation({ mutationFn: () => authAPI.login(), onSuccess: ({ url }) => window.location.assign(url) });
  const finish = useMutation({ mutationFn: (url: string) => authAPI.finish(url), onSuccess: onAuth });
  const logout = useMutation({ mutationFn: () => authAPI.logout(), onSuccess: onAuth });
  const error = [upload, login, finish, logout].find((m) => m.isError)?.error?.message;
  return { upload, login, finish, logout, error };
}

type Actions = ReturnType<typeof useAuthActions>;

function AccountRow({ auth, login, logout }: { auth: AuthStatus } & Pick<Actions, 'login' | 'logout'>) {
  const hint = auth.connected
    ? (auth.account ?? 'Google Drive is ready.')
    : auth.has_client ? (auth.error ?? 'Sign in to let the app upload to your Drive.') : 'Step 1: add your OAuth client file.';
  return (
    <div className="setting-row">
      <div className="setting-text">
        <span className="setting-label">{auth.connected ? 'Connected' : 'Not connected'}</span>
        <span className="setting-hint">{hint}</span>
      </div>
      {auth.connected && (
        <button type="button" className="btn btn-secondary" disabled={logout.isPending} onClick={() => logout.mutate()}>Sign out</button>
      )}
      {!auth.connected && auth.has_client && (
        <button type="button" className="btn btn-primary" disabled={login.isPending} onClick={() => login.mutate()}>
          {login.isPending ? 'Opening Google…' : 'Sign in with Google'}
        </button>
      )}
    </div>
  );
}

function ClientFileRow({ hasClient, upload }: { hasClient: boolean } & Pick<Actions, 'upload'>) {
  const onFile = async (file?: File) => file && upload.mutate(await file.text());
  return (
    <div className="setting-row setting-row--stack">
      <label htmlFor="oauth-client" className="setting-text">
        <span className="setting-label">{hasClient ? 'Replace OAuth client' : 'OAuth client file'}</span>
        <span className="setting-hint">
          In Google Cloud Console, enable the Drive API, create an OAuth client ID (Desktop app), and download its JSON.
          The file and your sign-in stay in the <code>config</code> volume.
        </span>
      </label>
      <input id="oauth-client" type="file" accept="application/json,.json" className="input" disabled={upload.isPending}
        onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

function FinishRow({ redirectUri, finish }: { redirectUri?: string | null } & Pick<Actions, 'finish'>) {
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const url = new FormData(e.currentTarget).get('url');
    if (typeof url === 'string' && url.trim()) finish.mutate(url);
  };
  return (
    <form className="setting-row setting-row--stack" onSubmit={onSubmit}>
      <label htmlFor="oauth-finish" className="setting-text">
        <span className="setting-label">Page didn't load after approving?</span>
        <span className="setting-hint">
          That happens when the app runs on another machine. Copy the full address from that tab
          (it starts with <code>{redirectUri}</code>) and paste it here.
        </span>
      </label>
      <div className="inline-form">
        <input id="oauth-finish" name="url" className="input" placeholder={`${redirectUri ?? ""}?code=…`} spellCheck={false} />
        <button type="submit" className="btn btn-secondary" disabled={finish.isPending}>Finish sign-in</button>
      </div>
    </form>
  );
}

// Google sign-in inside the app: upload OAuth client → consent → token saved to the config volume.
export default function GoogleAccount() {
  const { data: auth, isPending } = useQuery({ queryKey: keys.auth, queryFn: () => authAPI.status() });
  const actions = useAuthActions();

  if (isPending || !auth) return <p className="setting-hint">Checking Google sign-in…</p>;
  if (auth.mode === 'adc') return <p className="setting-hint">{auth.connected ? 'Signed in through Google Colab.' : auth.error}</p>;

  return (
    <>
      <AccountRow auth={auth} login={actions.login} logout={actions.logout} />
      {!auth.connected && <ClientFileRow hasClient={auth.has_client} upload={actions.upload} />}
      {auth.has_client && !auth.connected && <FinishRow redirectUri={auth.redirect_uri} finish={actions.finish} />}
      {actions.error && <p className="status error" role="alert">{actions.error}</p>}
    </>
  );
}
