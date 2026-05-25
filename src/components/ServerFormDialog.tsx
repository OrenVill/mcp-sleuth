import { useEffect, useState } from 'react';
import type { ServerAuth } from '../types';

export interface ServerFormValues {
  name: string;
  url: string;
  description?: string;
  /** Omitted when authentication is “None”. */
  auth?: ServerAuth;
  proxyThroughLocal: boolean;
}

interface Props {
  open: boolean;
  mode: 'add' | 'edit';
  initialValues?: ServerFormValues;
  onClose: () => void;
  onSubmit: (values: ServerFormValues) => void;
  validate?: (values: ServerFormValues) => string | null;
}

const inputClass =
  'mt-1.5 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none transition-colors';

/** UI-only distinction: both map to `ServerAuth.method === 'bearer'`. */
type AuthChoice = 'none' | 'oauth_access' | 'bearer' | 'api_key' | 'basic';

const AUTH_OPTIONS: {
  choice: AuthChoice;
  title: string;
  hint?: string;
}[] = [
  { choice: 'none', title: 'No authentication' },
  {
    choice: 'oauth_access',
    title: 'OAuth access token',
    hint: 'Paste an access token from your OAuth flow (sent as Authorization: Bearer).',
  },
  {
    choice: 'bearer',
    title: 'Access token (Bearer)',
    hint: 'Personal access token or generic Bearer credential.',
  },
  {
    choice: 'api_key',
    title: 'API key',
    hint: 'Sent as a custom HTTP header (e.g. X-API-Key).',
  },
  {
    choice: 'basic',
    title: 'HTTP Basic',
    hint: 'Username and password encoded as Basic authentication.',
  },
];

function choiceFromAuth(auth?: ServerAuth): AuthChoice {
  if (!auth || auth.method === 'none') return 'none';
  if (auth.method === 'bearer') return 'bearer';
  if (auth.method === 'api_key') return 'api_key';
  if (auth.method === 'basic') return 'basic';
  return 'none';
}

export function ServerFormDialog({
  open,
  mode,
  initialValues,
  onClose,
  onSubmit,
  validate,
}: Props) {
  const [name, setName] = useState(() => initialValues?.name ?? '');
  const [url, setUrl] = useState(() => initialValues?.url ?? 'http://localhost:8000/mcp');
  const [proxyThroughLocal, setProxyThroughLocal] = useState(
    () => initialValues?.proxyThroughLocal ?? true,
  );
  const [description, setDescription] = useState(() => initialValues?.description ?? '');
  const [authChoice, setAuthChoice] = useState<AuthChoice>(() =>
    choiceFromAuth(initialValues?.auth),
  );
  const [bearerToken, setBearerToken] = useState(() =>
    initialValues?.auth?.method === 'bearer' ? (initialValues.auth.bearerToken ?? '') : '',
  );
  const [apiKeyHeader, setApiKeyHeader] = useState(() =>
    initialValues?.auth?.method === 'api_key'
      ? (initialValues.auth.apiKeyHeader ?? 'X-API-Key')
      : 'X-API-Key',
  );
  const [apiKeyValue, setApiKeyValue] = useState(() =>
    initialValues?.auth?.method === 'api_key' ? (initialValues.auth.apiKeyValue ?? '') : '',
  );
  const [basicUser, setBasicUser] = useState(() =>
    initialValues?.auth?.method === 'basic' ? (initialValues.auth.basicUsername ?? '') : '',
  );
  const [basicPassword, setBasicPassword] = useState(() =>
    initialValues?.auth?.method === 'basic' ? (initialValues.auth.basicPassword ?? '') : '',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function buildAuthPayload(): ServerAuth | undefined {
    switch (authChoice) {
      case 'none':
        return undefined;
      case 'oauth_access':
      case 'bearer':
        return { method: 'bearer', bearerToken: bearerToken.trim() };
      case 'api_key':
        return {
          method: 'api_key',
          apiKeyHeader: apiKeyHeader.trim() || 'X-API-Key',
          apiKeyValue: apiKeyValue.trim(),
        };
      case 'basic':
        return {
          method: 'basic',
          basicUsername: basicUser.trim(),
          basicPassword,
        };
      default:
        return undefined;
    }
  }

  function validateAuth(): string | null {
    switch (authChoice) {
      case 'none':
        return null;
      case 'oauth_access':
      case 'bearer':
        if (!bearerToken.trim()) return 'Access token is required for this auth method';
        return null;
      case 'api_key':
        if (!apiKeyHeader.trim()) return 'API key header name is required';
        if (!apiKeyValue.trim()) return 'API key value is required';
        return null;
      case 'basic':
        if (!basicUser.trim()) return 'Username is required for Basic authentication';
        return null;
      default:
        return null;
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const values: ServerFormValues = {
      name: name.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
      auth: buildAuthPayload(),
      proxyThroughLocal,
    };
    if (!values.name) {
      setError('Name is required');
      return;
    }
    try {
      new URL(values.url);
    } catch {
      setError('URL is invalid');
      return;
    }
    const authErr = validateAuth();
    if (authErr) {
      setError(authErr);
      return;
    }
    const externalError = validate?.(values);
    if (externalError) {
      setError(externalError);
      return;
    }
    onSubmit(values);
  }

  const selectedHint = AUTH_OPTIONS.find((o) => o.choice === authChoice)?.hint;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl shadow-black/60 my-auto"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden>
              {mode === 'add' ? (
                <path d="M5 12h14M12 5v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              ) : (
                <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              )}
            </svg>
          </div>
          <div>
            <h3 className="text-zinc-50 font-semibold tracking-tight">
              {mode === 'add' ? 'Add MCP Server' : 'Edit MCP Server'}
            </h3>
            <p className="text-xs text-zinc-500">
              {mode === 'add'
                ? "We'll connect right after you save."
                : 'Changing URL or authentication while connected will reconnect.'}
            </p>
          </div>
        </div>

        <label className="block text-xs text-zinc-400 font-medium">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My local server"
            className={inputClass}
            autoFocus
          />
        </label>
        <label className="block text-xs text-zinc-400 font-medium">
          MCP HTTP URL
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8000/mcp"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={proxyThroughLocal}
            onChange={(e) => setProxyThroughLocal(e.target.checked)}
            className="mt-0.5 accent-violet-500 shrink-0"
          />
          <span>
            <span className="block text-sm text-zinc-200 leading-tight">Proxy through local explorer</span>
            <span className="block text-[11px] text-zinc-500 leading-snug mt-1">
              Rewrites MCP requests through this localhost app so servers do not need browser CORS headers.
            </span>
          </span>
        </label>
        <label className="block text-xs text-zinc-400 font-medium">
          Description
          <span className="text-zinc-600 font-normal ml-1">(optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>

        <fieldset className="space-y-2 min-w-0">
          <legend className="text-xs text-zinc-400 font-medium">Authentication</legend>
          <p className="text-[11px] text-zinc-600 leading-snug -mt-0.5">
            Choose how requests to the MCP endpoint are authenticated. Credentials are stored in this browser only
            (localStorage).
          </p>
          <ul className="space-y-1.5" role="radiogroup" aria-label="Authentication method">
            {AUTH_OPTIONS.map(({ choice, title }) => {
              const selected = authChoice === choice;
              return (
                <li key={choice}>
                  <label
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                      selected
                        ? 'border-violet-500/80 bg-violet-950/25 ring-1 ring-violet-500/30'
                        : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="auth-method"
                      checked={selected}
                      onChange={() => setAuthChoice(choice)}
                      className="mt-0.5 accent-violet-500 shrink-0"
                    />
                    <span className="text-sm text-zinc-200 leading-tight">{title}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          {selectedHint && authChoice !== 'none' && (
            <p className="text-[11px] text-zinc-500 pt-0.5">{selectedHint}</p>
          )}

          {(authChoice === 'oauth_access' || authChoice === 'bearer') && (
            <label className="block text-xs text-zinc-400 font-medium pt-1">
              {authChoice === 'oauth_access' ? 'OAuth access token' : 'Token'}
              <input
                type="password"
                autoComplete="off"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder="••••••••••••"
                className={inputClass}
              />
            </label>
          )}

          {authChoice === 'api_key' && (
            <div className="space-y-3 pt-1">
              <label className="block text-xs text-zinc-400 font-medium">
                Header name
                <input
                  type="text"
                  value={apiKeyHeader}
                  onChange={(e) => setApiKeyHeader(e.target.value)}
                  placeholder="X-API-Key"
                  className={`${inputClass} font-mono text-xs`}
                />
              </label>
              <label className="block text-xs text-zinc-400 font-medium">
                API key
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  placeholder="••••••••••••"
                  className={inputClass}
                />
              </label>
            </div>
          )}

          {authChoice === 'basic' && (
            <div className="space-y-3 pt-1">
              <label className="block text-xs text-zinc-400 font-medium">
                Username
                <input
                  type="text"
                  autoComplete="off"
                  value={basicUser}
                  onChange={(e) => setBasicUser(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-xs text-zinc-400 font-medium">
                Password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={basicPassword}
                  onChange={(e) => setBasicPassword(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}
        </fieldset>

        {error && (
          <div className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/60">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="text-sm px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium shadow-sm shadow-violet-950/50 transition-colors"
          >
            {mode === 'add' ? 'Add & connect' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
