import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ServerEntry } from '../types';
import { getHost } from '../lib/host';
import type { LlmConfig, LlmProviderId } from '../lib/agent/types';
import { Select } from './Select';
import { Popover } from './Popover';

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

  const modelLabel = active
    ? loading
      ? 'Finding models…'
      : active.model || 'No model'
    : 'No model server';
  const selectedCount = connected.filter((s) => selectedServerIds.includes(s.id)).length;

  return (
    <div className="flex items-center gap-2">
      {/*
        Two popovers rather than a row of controls. Which model drives the chat
        and which servers it may reach are the only two decisions here, and each
        one's detail — the model list, the per-server checkboxes — belongs behind
        its own summary rather than spread across the bar.
      */}
      <Popover
        testId="llm-picker"
        aria-label="Model"
        align="right"
        className="group flex items-center gap-2 h-9 pl-2 pr-2.5 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 transition-colors"
        panelClassName="w-72"
        trigger={({ open }) => (
          <>
            <span
              className={[
                'flex items-center justify-center w-6 h-6 rounded-md border',
                active
                  ? 'border-violet-800/60 bg-violet-950/50 text-violet-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-600',
              ].join(' ')}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden>
                <path d="M8 1.5 9.6 6l4.4 1.6L9.6 9.2 8 13.6 6.4 9.2 2 7.6 6.4 6z" />
              </svg>
            </span>
            <span className="flex flex-col items-start min-w-0 leading-tight">
              <span className="text-[11px] font-medium text-zinc-200 truncate max-w-[11rem]">
                {modelLabel}
              </span>
              <span className="text-[10px] text-zinc-600 truncate max-w-[11rem]">
                {active?.label ?? 'Add one to start'}
              </span>
            </span>
            <Chevron open={open} />
          </>
        )}
      >
        {({ close }) => (
          <div className="py-1">
            <PanelHeading>Model server</PanelHeading>
            <div className="px-2 pb-2">
              <Select
                testId="llm-config-select"
                value={activeConfigId ?? ''}
                onChange={onSelectConfig}
                aria-label="LLM server"
                placeholder="No model server"
                options={configs.map((config) => ({ value: config.id, label: config.label }))}
                className="w-full"
              />
            </div>

            {active && (
              <>
                <PanelHeading>
                  Model
                  <button
                    type="button"
                    onClick={rediscover}
                    title="Re-check which models this server has"
                    aria-label="Refresh model list"
                    className="ml-auto text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
                      <path
                        d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </PanelHeading>
                <div className="px-2 pb-2">
                  {loading ? (
                    <p data-testid="llm-models-loading" className="text-[11px] text-zinc-500 px-1 py-1.5">
                      Finding models…
                    </p>
                  ) : found?.status === 'error' ? (
                    <div className="space-y-1.5">
                      {/* Not every OpenAI-compatible server implements /v1/models,
                          so a failed lookup must not make the server unusable. */}
                      <p
                        data-testid="llm-models-error"
                        title={found.error}
                        className="text-[11px] text-amber-400"
                      >
                        No model list from this server
                      </p>
                      <input
                        data-testid="llm-model-manual"
                        value={active.model}
                        onChange={(e) => onSaveConfig({ ...active, model: e.target.value })}
                        placeholder="model name"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  ) : (
                    <Select
                      testId="llm-model-select"
                      value={active.model}
                      onChange={(model) => onSaveConfig({ ...active, model })}
                      aria-label="Model"
                      placeholder="No models reported"
                      options={(found?.models ?? []).map((model) => ({ value: model, label: model }))}
                      className="w-full"
                    />
                  )}
                </div>
              </>
            )}

            <div className="my-1 h-px bg-zinc-800" />
            <PanelAction onClick={() => { close(); setDraft(blankConfig()); }}>
              Add model server
            </PanelAction>
            {active && (
              <>
                <PanelAction onClick={() => { close(); setDraft(active); }}>
                  Edit “{active.label}”
                </PanelAction>
                <PanelAction
                  destructive
                  onClick={() => { close(); onDeleteConfig(active.id); }}
                >
                  Remove “{active.label}”
                </PanelAction>
              </>
            )}
          </div>
        )}
      </Popover>

      <Popover
        testId="mcp-scope-picker"
        aria-label="MCP servers in scope"
        align="right"
        className="group flex items-center gap-2 h-9 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 transition-colors"
        panelClassName="w-64"
        trigger={({ open }) => (
          <>
            <span
              className={[
                'w-1.5 h-1.5 rounded-full',
                selectedCount > 0 ? 'bg-emerald-400' : 'bg-zinc-700',
              ].join(' ')}
              aria-hidden
            />
            <span className="text-[11px] text-zinc-300">
              {connected.length === 0 ? (
                <span data-testid="no-connected-servers" className="text-zinc-600">
                  No MCP server
                </span>
              ) : (
                <>
                  {selectedCount} of {connected.length} server{connected.length === 1 ? '' : 's'}
                </>
              )}
            </span>
            <Chevron open={open} />
          </>
        )}
      >
        {() => (
          <div className="py-1">
            <PanelHeading>Exposed to the model</PanelHeading>
            {connected.length === 0 ? (
              <p className="px-3 pb-2 text-[11px] text-zinc-600">
                Connect a server and it will appear here.
              </p>
            ) : (
              <div className="pb-1">
                {connected.map((server) => {
                  const on = selectedServerIds.includes(server.id);
                  return (
                    <label
                      key={server.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggleServer(server.id)}
                        className="accent-violet-500 w-3.5 h-3.5"
                      />
                      <span className="flex-1 min-w-0 truncate">{server.name}</span>
                      {on && <span className="text-[10px] text-violet-400">in scope</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Popover>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`shrink-0 w-3 h-3 text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="M4.5 6.5 8 10l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-zinc-600">
      {children}
    </div>
  );
}

function PanelAction({
  children,
  onClick,
  destructive = false,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left text-xs px-3 py-1.5 truncate transition-colors',
        destructive
          ? 'text-red-300 hover:bg-red-950/50'
          : 'text-zinc-300 hover:bg-zinc-800',
      ].join(' ')}
    >
      {children}
    </button>
  );
}


