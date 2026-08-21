import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ServerEntry } from '../types';
import { getHost } from '../lib/host';
import type { LlmConfig, LlmProviderId } from '../lib/agent/types';

interface Props {
  configs: LlmConfig[];
  activeConfigId: string | null;
  servers: ServerEntry[];
  selectedServerIds: string[];
  onSelectConfig: (id: string) => void;
  onSaveConfig: (config: LlmConfig) => void;
  onDeleteConfig: (id: string) => void;
  onToggleServer: (serverId: string) => void;
}

/**
 * The provider types a user can add. Only adapters registered in
 * `providers/index.ts` may appear here — an unregistered id would type-check
 * and then throw at the first request.
 */
const PROVIDERS: { id: LlmProviderId; label: string; baseUrl: string; hint: string }[] = [
  {
    id: 'openai',
    label: 'OpenAI-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    hint: 'Ollama, LM Studio, vLLM, OpenAI itself — anything serving /v1/chat/completions.',
  },
];

function blankConfig(): LlmConfig {
  return {
    id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    provider: 'openai',
    baseUrl: PROVIDERS[0].baseUrl,
    model: '',
  };
}

interface Discovery {
  status: 'ok' | 'error';
  models: string[];
  error?: string;
}

/**
 * Identity for the discovery cache. Deliberately excludes `model`: choosing a
 * different model must not look like a different server and re-trigger the
 * lookup that just populated the list.
 */
function serverKey(config: LlmConfig): string {
  return [config.id, config.provider, config.baseUrl, config.apiKey ?? ''].join('|');
}

const FIELD =
  'w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500';
const LABEL = 'block text-[10px] uppercase tracking-wide text-zinc-500';

export function AgentModelPicker({
  configs,
  activeConfigId,
  servers,
  selectedServerIds,
  onSelectConfig,
  onSaveConfig,
  onDeleteConfig,
  onToggleServer,
}: Props) {
  const [draft, setDraft] = useState<LlmConfig | null>(configs.length === 0 ? blankConfig() : null);
  /** Discovered models per server key. Session-only: never persisted. */
  const [discovery, setDiscovery] = useState<Record<string, Discovery>>({});
  const connected = servers.filter((server) => server.status === 'connected');

  /*
   * The parent rebuilds its handlers every render. Reading the latest one
   * through a ref keeps it out of the discovery effect's dependencies, so a
   * re-render mid-lookup cannot cancel and restart the request.
   */
  const saveRef = useRef(onSaveConfig);
  useEffect(() => {
    saveRef.current = onSaveConfig;
  });

  const active = configs.find((config) => config.id === activeConfigId) ?? null;
  const activeKey = active ? serverKey(active) : null;
  const found = activeKey ? discovery[activeKey] : undefined;
  /** Derived, not stored: an unanswered key is by definition still in flight. */
  const loading = Boolean(active) && found === undefined;

  /*
   * Model discovery. The user names a server and its type; the app asks the
   * server which models it has. Nothing here sets state synchronously, which
   * both satisfies react-hooks/set-state-in-effect and keeps a failed lookup
   * from blocking the render.
   */
  useEffect(() => {
    if (!active || !activeKey || found !== undefined) return;
    let cancelled = false;
    void getHost()
      .llm.listModels(active)
      .then(
        (models) => {
          if (cancelled) return;
          setDiscovery((current) => ({ ...current, [activeKey]: { status: 'ok', models } }));
          // Adopt a real model as soon as one is known, so the very first
          // message does not go out with an empty model name.
          if (models.length > 0 && !models.includes(active.model)) {
            saveRef.current({ ...active, model: models[0] });
          }
        },
        (err: unknown) => {
          if (cancelled) return;
          setDiscovery((current) => ({
            ...current,
            [activeKey]: {
              status: 'error',
              models: [],
              error: err instanceof Error ? err.message : String(err),
            },
          }));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [active, activeKey, found]);

  const rediscover = useCallback(() => {
    if (!activeKey) return;
    setDiscovery((current) => {
      const next = { ...current };
      delete next[activeKey];
      return next;
    });
  }, [activeKey]);

  /*
   * The form is a centered modal, not an inline swap. It used to render in
   * place of the controls below — inside the chat header's right-aligned box —
   * so a whole form was crammed into a 56px-tall bar and pushed off the right
   * edge of the window.
   */
  if (draft) {
    const provider = PROVIDERS.find((p) => p.id === draft.provider) ?? PROVIDERS[0];
    const editing = configs.some((c) => c.id === draft.id);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <form
          data-testid="llm-config-form"
          className="w-full max-w-md space-y-3 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveConfig(draft);
            setDraft(null);
          }}
        >
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-zinc-100">
              {editing ? 'Edit LLM server' : 'Add an LLM server'}
            </h3>
            <p className="text-[11px] text-zinc-500">
              Point Sleuth at a server and it will ask which models that server has. Credentials
              are stored in the encrypted vault, alongside your MCP servers.
            </p>
          </div>

          <label className="block space-y-1">
            <span className={LABEL}>Name</span>
            <input
              required
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Local Ollama"
              className={FIELD}
            />
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>Type</span>
            <div className="relative">
              <select
                data-testid="llm-provider-select"
                value={draft.provider}
                onChange={(e) => {
                  const next =
                    PROVIDERS.find((p) => p.id === (e.target.value as LlmProviderId)) ??
                    PROVIDERS[0];
                  setDraft({ ...draft, provider: next.id, baseUrl: next.baseUrl });
                }}
                className={`${FIELD} appearance-none pr-7`}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500"
              >
                <path
                  d="M4.5 6.5 8 10l3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="block text-[10px] text-zinc-600">{provider.hint}</span>
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>Base URL</span>
            <input
              required
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value.replace(/\/+$/, '') })}
              className={FIELD}
            />
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>API key (leave empty for local models)</span>
            <input
              type="password"
              value={draft.apiKey ?? ''}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value || undefined })}
              className={FIELD}
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white font-medium hover:bg-violet-500 transition-colors"
            >
              {editing ? 'Save server' : 'Add server'}
            </button>
            {/*
              Always dismissible. The form opens by itself when no server is
              configured yet, so gating Cancel on `configs.length > 0` left the
              very first visitor inside a modal with no way out but to fill it in.
            */}
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        `appearance-none` is load-bearing: without it the control renders with
        the OS's own light chrome, which reads as a foreign element on a dark
        page. The chevron replaces the one that removes.
      */}
      <Dropdown
        testId="llm-config-select"
        value={activeConfigId ?? ''}
        onChange={onSelectConfig}
        title="LLM server"
      >
        {configs.map((config) => (
          <option key={config.id} value={config.id}>
            {config.label}
          </option>
        ))}
      </Dropdown>

      {active && (
        <>
          {loading ? (
            <span data-testid="llm-models-loading" className="text-[11px] text-zinc-500">
              Finding models…
            </span>
          ) : found?.status === 'error' ? (
            <span className="flex items-center gap-1.5">
              <span
                data-testid="llm-models-error"
                title={found.error}
                className="text-[11px] text-amber-400 max-w-[14rem] truncate"
              >
                No model list from this server
              </span>
              {/* Not every OpenAI-compatible server implements /v1/models, so a
                  failed lookup must not make the server unusable. */}
              <input
                data-testid="llm-model-manual"
                value={active.model}
                onChange={(e) => onSaveConfig({ ...active, model: e.target.value })}
                placeholder="model name"
                className="w-32 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
              />
            </span>
          ) : (
            <Dropdown
              testId="llm-model-select"
              value={active.model}
              onChange={(model) => onSaveConfig({ ...active, model })}
              title="Model"
            >
              {found?.models.length ? (
                found.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              ) : (
                <option value="">No models reported</option>
              )}
            </Dropdown>
          )}

          <button
            type="button"
            onClick={rediscover}
            title="Re-check which models this server has"
            className="text-xs px-2 py-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/70 transition-colors"
          >
            Refresh
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => setDraft(blankConfig())}
        className="text-xs px-2 py-1 rounded-md text-zinc-500 hover:text-violet-300 hover:bg-zinc-800/70 transition-colors"
      >
        Add server
      </button>
      {active && (
        <>
          <button
            type="button"
            onClick={() => setDraft(active)}
            className="text-xs px-2 py-1 rounded-md text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDeleteConfig(active.id)}
            className="text-xs px-2 py-1 rounded-md text-zinc-600 hover:text-red-300 hover:bg-red-950/40 transition-colors"
          >
            Remove
          </button>
        </>
      )}

      <div className="h-4 w-px bg-zinc-800" aria-hidden />

      <span className="text-[10px] uppercase tracking-wide text-zinc-600">MCP</span>
      <div className="flex flex-wrap items-center gap-1">
        {connected.map((server) => (
          <label
            key={server.id}
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedServerIds.includes(server.id)}
              onChange={() => onToggleServer(server.id)}
              className="accent-violet-500"
            />
            {server.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function Dropdown({
  testId,
  value,
  onChange,
  title,
  children,
}: {
  testId: string;
  value: string;
  onChange: (value: string) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        data-testid={testId}
        title={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-zinc-900 border border-zinc-700 rounded-md pl-2.5 pr-7 py-1.5 text-xs text-zinc-200 hover:border-zinc-600 focus:outline-none focus:border-violet-500 transition-colors max-w-[13rem] truncate"
      >
        {children}
      </select>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500"
      >
        <path
          d="M4.5 6.5 8 10l3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
