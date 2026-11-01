import { useEffect, useState } from 'react';
import type { ServerAuth, ServerStdioConfig, ServerTransport } from '../types';
import { envRowsToMap, hasDuplicateEnvKeys, parseArgsLines } from '../lib/stdioParse';
import { isKeptSecret } from '../lib/secretFields';
import { isHttpsUrl } from '../lib/serverUrl';
import { SecretInput } from './SecretInput';

export interface ServerFormValues {
  name: string;
  url: string;
  description?: string;
  /** Omitted when authentication is “None”. */
  auth?: ServerAuth;
  proxyThroughLocal: boolean;
  allowSelfSigned: boolean;
  transport: ServerTransport;
  stdioCommand: string;
  stdioArgsText: string;
  stdioCwd: string;
  /**
   * `storedKey` names the environment entry a row was masked from, so a row the
   * user renames still resolves back to the right stored secret.
   */
  stdioEnvRows: { key: string; value: string; storedKey?: string }[];
  stdio?: ServerStdioConfig;
  stdioEnv?: Record<string, string>;
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

/** `inputClass` without the width and margin: a secret field shares its row with a button. */
const secretInputClass =
  'px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none transition-colors';

/** UI-only distinction: both map to `ServerAuth.method === 'bearer'`. */
type AuthChoice = 'none' | 'oauth_access' | 'bearer' | 'api_key' | 'basic';
type EnvRow = { key: string; value: string; storedKey?: string };

const EMPTY_ENV_ROW: EnvRow = { key: '', value: '' };

/** True in the desktop build, where MCP leaves the main process and there is no proxy. */
const isDesktop = typeof window !== 'undefined' && 'mcpSleuth' in window;

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

function sameEnvRows(a: EnvRow[], b: EnvRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].key !== b[i].key || a[i].value !== b[i].value) return false;
  }
  return true;
}

function normalizeEnvRows(rows?: EnvRow[]): EnvRow[] {
  return rows && rows.length > 0 ? rows : [{ ...EMPTY_ENV_ROW }];
}

import { ConfirmDialog } from './ConfirmDialog';

export function ServerFormDialog({
  open,
  mode,
  initialValues,
  onClose,
  onSubmit,
  validate,
}: Props) {
  const initialTransport = initialValues?.transport ?? 'http';
  const initialUrl = initialValues?.url ?? 'http://localhost:8000/mcp';
  const initialProxyThroughLocal = initialValues?.proxyThroughLocal ?? true;
  const initialAllowSelfSigned = initialValues?.allowSelfSigned ?? false;
  const initialStdioCommand = initialValues?.stdioCommand ?? '';
  const initialStdioArgsText = initialValues?.stdioArgsText ?? '';
  const initialStdioCwd = initialValues?.stdioCwd ?? '';
  const initialStdioEnvRows = normalizeEnvRows(initialValues?.stdioEnvRows);
  const [name, setName] = useState(() => initialValues?.name ?? '');
  const [transport, setTransport] = useState<ServerTransport>(() => initialTransport);
  const [pendingTransport, setPendingTransport] = useState<ServerTransport | null>(null);
  const [url, setUrl] = useState(() => initialUrl);
  const [proxyThroughLocal, setProxyThroughLocal] = useState(() => initialProxyThroughLocal);
  const [allowSelfSigned, setAllowSelfSigned] = useState(() => initialAllowSelfSigned);
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
  const [stdioCommand, setStdioCommand] = useState(() => initialStdioCommand);
  const [stdioArgsText, setStdioArgsText] = useState(() => initialStdioArgsText);
  const [stdioCwd, setStdioCwd] = useState(() => initialStdioCwd);
  const [stdioEnvRows, setStdioEnvRows] = useState<EnvRow[]>(() => initialStdioEnvRows);
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

  const initialAuthChoice = choiceFromAuth(initialValues?.auth);
  const initialBearerToken =
    initialValues?.auth?.method === 'bearer' ? (initialValues.auth.bearerToken ?? '') : '';
  const initialApiKeyHeader =
    initialValues?.auth?.method === 'api_key'
      ? (initialValues.auth.apiKeyHeader ?? 'X-API-Key')
      : 'X-API-Key';
  const initialApiKeyValue =
    initialValues?.auth?.method === 'api_key' ? (initialValues.auth.apiKeyValue ?? '') : '';
  const initialBasicUser =
    initialValues?.auth?.method === 'basic' ? (initialValues.auth.basicUsername ?? '') : '';
  const initialBasicPassword =
    initialValues?.auth?.method === 'basic' ? (initialValues.auth.basicPassword ?? '') : '';
  // A masked initial value is the form's only evidence that the server already
  // has a credential here — it never receives the credential itself.
  const hasStoredBearer = isKeptSecret(initialBearerToken);
  const hasStoredApiKey = isKeptSecret(initialApiKeyValue);
  const hasStoredBasicPassword = isKeptSecret(initialBasicPassword);
  const httpFieldsEdited =
    url !== initialUrl ||
    proxyThroughLocal !== initialProxyThroughLocal ||
    allowSelfSigned !== initialAllowSelfSigned ||
    authChoice !== initialAuthChoice ||
    bearerToken !== initialBearerToken ||
    apiKeyHeader !== initialApiKeyHeader ||
    apiKeyValue !== initialApiKeyValue ||
    basicUser !== initialBasicUser ||
    basicPassword !== initialBasicPassword;
  const stdioFieldsEdited =
    stdioCommand !== initialStdioCommand ||
    stdioArgsText !== initialStdioArgsText ||
    stdioCwd !== initialStdioCwd ||
    !sameEnvRows(stdioEnvRows, initialStdioEnvRows);

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
    const stdioArgs = parseArgsLines(stdioArgsText);
    const { env, envKeys } = envRowsToMap(stdioEnvRows);
    const stdioCommandTrimmed = stdioCommand.trim();
    const stdioCwdTrimmed = stdioCwd.trim();
    const stdio: ServerStdioConfig | undefined = transport === 'stdio'
      ? {
          command: stdioCommandTrimmed,
          args: stdioArgs,
          cwd: stdioCwdTrimmed || undefined,
          envKeys: envKeys.length > 0 ? envKeys : undefined,
        }
      : undefined;

    const values: ServerFormValues = {
      name: name.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
      auth: transport === 'http' ? buildAuthPayload() : undefined,
      proxyThroughLocal,
      allowSelfSigned,
      transport,
      stdioCommand,
      stdioArgsText,
      stdioCwd,
      stdioEnvRows,
      stdio,
      stdioEnv: transport === 'stdio' ? env : undefined,
    };
    if (!values.name) {
      setError('Name is required');
      return;
    }
    if (transport === 'http') {
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
    } else if (!stdioCommandTrimmed) {
      setError('Command is required for stdio transport');
      return;
    } else if (hasDuplicateEnvKeys(stdioEnvRows)) {
      setError('Environment variable names must be unique');
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

  function handleTransportChange(next: ServerTransport) {
    if (next === transport) return;
    const leavingEdited = transport === 'http' ? httpFieldsEdited : stdioFieldsEdited;
    if (leavingEdited) {
      // Confirm in-app rather than through window.confirm, which renders as
      // unstyled browser chrome inside the desktop window.
      setPendingTransport(next);
      return;
    }
    setError(null);
    setTransport(next);
  }

  function applyPendingTransport() {
    if (pendingTransport === null) return;
    setError(null);
    setTransport(pendingTransport);
    setPendingTransport(null);
  }

  function updateEnvRow(index: number, patch: Partial<EnvRow>) {
    setStdioEnvRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addEnvRow() {
    setStdioEnvRows((prev) => [...prev, { ...EMPTY_ENV_ROW }]);
  }

  function removeEnvRow(index: number) {
    setStdioEnvRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

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
        <fieldset className="space-y-2 min-w-0">
          <legend className="text-xs text-zinc-400 font-medium">Transport</legend>
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-950/50 p-1">
            <label
              className={`flex-1 rounded-md px-3 py-1.5 text-sm text-center cursor-pointer transition-colors ${
                transport === 'http'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-950/40'
                  : 'text-zinc-300 hover:bg-zinc-800/80'
              }`}
            >
              <input
                type="radio"
                name="transport"
                checked={transport === 'http'}
                onChange={() => handleTransportChange('http')}
                className="sr-only"
              />
              HTTP
            </label>
            <label
              className={`flex-1 rounded-md px-3 py-1.5 text-sm text-center cursor-pointer transition-colors ${
                transport === 'stdio'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-950/40'
                  : 'text-zinc-300 hover:bg-zinc-800/80'
              }`}
            >
              <input
                type="radio"
                name="transport"
                checked={transport === 'stdio'}
                onChange={() => handleTransportChange('stdio')}
                className="sr-only"
              />
              Stdio
            </label>
          </div>
        </fieldset>
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

        {transport === 'http' && (
          <>
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
                <span className="block text-sm text-zinc-200 leading-tight">Proxy through local server</span>
                <span className="block text-[11px] text-zinc-500 leading-snug mt-1">
                  Rewrites MCP requests through this localhost app so servers do not need browser CORS headers.
                </span>
              </span>
            </label>

            {isHttpsUrl(url) && (
              <label className="flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowSelfSigned}
                  onChange={(e) => setAllowSelfSigned(e.target.checked)}
                  className="mt-0.5 accent-amber-500 shrink-0"
                />
                <span>
                  <span className="block text-sm text-zinc-200 leading-tight">
                    Allow self-signed certificate
                  </span>
                  <span className="block text-[11px] text-zinc-500 leading-snug mt-1">
                    Skips certificate verification for this server only. For a development or
                    intranet endpoint whose certificate no public CA signed.
                  </span>
                  {allowSelfSigned && !proxyThroughLocal && !isDesktop && (
                    <span className="block text-[11px] text-amber-500/90 leading-snug mt-1.5">
                      Turn on “Proxy through local server” as well: a browser applies its own
                      certificate checks to a direct connection and a page cannot waive them.
                    </span>
                  )}
                </span>
              </label>
            )}

            <fieldset className="space-y-2 min-w-0">
              <legend className="text-xs text-zinc-400 font-medium">Authentication</legend>
              <p className="text-[11px] text-zinc-600 leading-snug -mt-0.5">
                Choose how requests to the MCP endpoint are authenticated. Credentials are stored in
                the encrypted vault, and are never shown again once saved.
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
                <div className="pt-1">
                  <label htmlFor="auth-bearer-token" className="block text-xs text-zinc-400 font-medium">
                    {authChoice === 'oauth_access' ? 'OAuth access token' : 'Token'}
                  </label>
                  <div className="mt-1.5">
                    <SecretInput
                      id="auth-bearer-token"
                      label={authChoice === 'oauth_access' ? 'OAuth access token' : 'Token'}
                      value={bearerToken}
                      onChange={setBearerToken}
                      hasStored={hasStoredBearer}
                      placeholder="••••••••••••"
                      className={secretInputClass}
                    />
                  </div>
                </div>
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
                  <div>
                    <label htmlFor="auth-api-key" className="block text-xs text-zinc-400 font-medium">
                      API key
                    </label>
                    <div className="mt-1.5">
                      <SecretInput
                        id="auth-api-key"
                        label="API key"
                        value={apiKeyValue}
                        onChange={setApiKeyValue}
                        hasStored={hasStoredApiKey}
                        placeholder="••••••••••••"
                        className={secretInputClass}
                      />
                    </div>
                  </div>
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
                  <div>
                    <label htmlFor="auth-basic-password" className="block text-xs text-zinc-400 font-medium">
                      Password
                    </label>
                    <div className="mt-1.5">
                      <SecretInput
                        id="auth-basic-password"
                        label="Password"
                        value={basicPassword}
                        onChange={setBasicPassword}
                        hasStored={hasStoredBasicPassword}
                        autoComplete="new-password"
                        className={secretInputClass}
                      />
                    </div>
                  </div>
                </div>
              )}
            </fieldset>
          </>
        )}

        {transport === 'stdio' && (
          <fieldset className="space-y-3 min-w-0">
            <legend className="text-xs text-zinc-400 font-medium">Stdio configuration</legend>
            <label className="block text-xs text-zinc-400 font-medium">
              Command
              <input
                type="text"
                value={stdioCommand}
                onChange={(e) => setStdioCommand(e.target.value)}
                placeholder="npx"
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="block text-xs text-zinc-400 font-medium">
              Arguments
              <span className="text-zinc-600 font-normal ml-1">(one per line)</span>
              <textarea
                value={stdioArgsText}
                onChange={(e) => setStdioArgsText(e.target.value)}
                placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/root"
                className={`${inputClass} font-mono min-h-24 resize-y`}
              />
            </label>
            <label className="block text-xs text-zinc-400 font-medium">
              Working directory
              <span className="text-zinc-600 font-normal ml-1">(optional)</span>
              <input
                type="text"
                value={stdioCwd}
                onChange={(e) => setStdioCwd(e.target.value)}
                placeholder="/home/user/project"
                className={`${inputClass} font-mono`}
              />
            </label>
            <div className="space-y-2">
              <div className="text-xs text-zinc-400 font-medium">Environment variables</div>
              {stdioEnvRows.map((row, idx) => (
                <div key={`${idx}-${row.key}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <label className="block text-xs text-zinc-500">
                    Key
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateEnvRow(idx, { key: e.target.value })}
                      placeholder="API_KEY"
                      className={`${inputClass} mt-1 font-mono text-xs`}
                    />
                  </label>
                  <div>
                    <label htmlFor={`stdio-env-value-${idx}`} className="block text-xs text-zinc-500">
                      Value
                    </label>
                    <div className="mt-1">
                      <SecretInput
                        id={`stdio-env-value-${idx}`}
                        label={row.key.trim() ? `value for ${row.key.trim()}` : 'value'}
                        value={row.value}
                        onChange={(value) => updateEnvRow(idx, { value })}
                        storedKey={row.storedKey}
                        hasStored={Boolean(row.storedKey)}
                        placeholder="••••••••"
                        className={`${secretInputClass} font-mono text-xs`}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEnvRow(idx)}
                    disabled={stdioEnvRows.length <= 1}
                    className="text-xs px-2.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addEnvRow}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors"
              >
                Add row
              </button>
            </div>
          </fieldset>
        )}

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

      <ConfirmDialog
        open={pendingTransport !== null}
        title="Discard unsaved edits?"
        message="You have unsaved edits in this transport section. Switching will discard them."
        confirmLabel="Switch anyway"
        danger
        onConfirm={applyPendingTransport}
        onCancel={() => setPendingTransport(null)}
      />
    </div>
  );
}
