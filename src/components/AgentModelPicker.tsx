import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerEntry } from '../types';
import { getHost } from '../lib/host';
import type { LlmConfig, LlmProviderId } from '../lib/agent/types';
import { Select } from './Select';

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
              <Select
                testId="llm-provider-select"
                value={draft.provider}
                onChange={(value) => {
                  const next =
                    PROVIDERS.find((p) => p.id === (value as LlmProviderId)) ?? PROVIDERS[0];
                  setDraft({ ...draft, provider: next.id, baseUrl: next.baseUrl });
                }}
                aria-label="Type"
                options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
                className="w-full"
              />
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
        Two clusters, not one run-on row: which model is driving the chat, and
        which servers it may reach, are separate decisions and are framed
        separately. `appearance-none` on the selects is load-bearing — without
        it they render in the OS's own light chrome on a dark page.
      */}
      <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/70 divide-x divide-zinc-800">
        <Select
          testId="llm-config-select"
          value={activeConfigId ?? ''}
          onChange={onSelectConfig}
          title="LLM server"
          aria-label="LLM server"
          options={configs.map((config) => ({ value: config.id, label: config.label }))}
          className="max-w-[13rem]"
          bare
        />

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
            <Select
              testId="llm-model-select"
              value={active.model}
              onChange={(model) => onSaveConfig({ ...active, model })}
              title="Model"
              aria-label="Model"
              placeholder="No models reported"
              options={(found?.models ?? []).map((model) => ({ value: model, label: model }))}
              className="max-w-[13rem]"
              bare
            />
          )}

          <button
            type="button"
            onClick={rediscover}
            title="Re-check which models this server has"
            aria-label="Refresh model list"
            className="px-2 py-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
              <path
                d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      )}
      </div>

      {/*
        Add/Edit/Remove live behind one control. Remove is destructive and was
        sitting exposed in the toolbar, a mis-click away from deleting the
        server whose model is driving the conversation.
      */}
      <ServerMenu
        hasActive={Boolean(active)}
        onAdd={() => setDraft(blankConfig())}
        onEdit={() => active && setDraft(active)}
        onRemove={() => active && onDeleteConfig(active.id)}
      />

      <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 pl-2 pr-1.5 py-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-600">MCP</span>
        {/* A bare label with nothing after it reads as broken chrome rather than
            as "you have not connected anything yet". */}
        {connected.length === 0 && (
          <span data-testid="no-connected-servers" className="text-[11px] text-zinc-600 pr-1">
            none connected
          </span>
        )}
        {connected.map((server) => {
          const on = selectedServerIds.includes(server.id);
          return (
            <label
              key={server.id}
              title={on ? 'Exposed to the model' : 'Not exposed to the model'}
              className={[
                'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border cursor-pointer transition-colors',
                on
                  ? 'border-violet-800/70 bg-violet-950/40 text-violet-200'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggleServer(server.id)}
                className="accent-violet-500 w-3 h-3"
              />
              {server.name}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Add / Edit / Remove behind one button, so the destructive one is not exposed. */
function ServerMenu({
  hasActive,
  onAdd,
  onEdit,
  onRemove,
}: {
  hasActive: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item =
    'w-full text-left text-xs px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid="llm-server-menu"
        aria-label="LLM server actions"
        aria-expanded={open}
        title="LLM server actions"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-800 bg-zinc-900/70 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
          <circle cx="3.5" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="12.5" cy="8" r="1.2" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-10 w-40 py-1 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          <button type="button" className={item} onClick={() => { setOpen(false); onAdd(); }}>
            Add server
          </button>
          <button
            type="button"
            disabled={!hasActive}
            className={item}
            onClick={() => { setOpen(false); onEdit(); }}
          >
            Edit server
          </button>
          <div className="my-1 h-px bg-zinc-800" />
          <button
            type="button"
            disabled={!hasActive}
            className={`${item} text-red-300 hover:bg-red-950/50`}
            onClick={() => { setOpen(false); onRemove(); }}
          >
            Remove server
          </button>
        </div>
      )}
    </div>
  );
}

