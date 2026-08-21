import { useState } from 'react';
import type { ServerEntry } from '../types';
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

const PROVIDERS: { id: LlmProviderId; label: string; baseUrl: string }[] = [
  { id: 'openai', label: 'OpenAI-compatible', baseUrl: 'http://127.0.0.1:11434/v1' },
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
  const connected = servers.filter((server) => server.status === 'connected');

  /*
   * The form is a centered modal, not an inline swap. It used to render in
   * place of the controls below — inside the chat header's right-aligned box —
   * so a five-field form was crammed into a 56px-tall bar and pushed off the
   * right edge of the window. It is also far too tall to live in a header.
   */
  if (draft) {
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
            {configs.some((c) => c.id === draft.id) ? 'Edit model' : 'Add a model'}
          </h3>
          <p className="text-[11px] text-zinc-500">
            Credentials are stored in the encrypted vault, alongside your servers.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Name</span>
          <input
            required
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Local Qwen"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Base URL</span>
          <input
            required
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value.replace(/\/+$/, '') })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Model</span>
          <input
            required
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder="qwen3"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">
            API key (leave empty for local models)
          </span>
          <input
            type="password"
            value={draft.apiKey ?? ''}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value || undefined })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white font-medium hover:bg-violet-500 transition-colors"
          >
            Save model
          </button>
          {/*
            Always dismissible. The form opens by itself when no model is
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
        page. The chevron below replaces the one that removes.
      */}
      <div className="relative">
        <select
          data-testid="llm-config-select"
          value={activeConfigId ?? ''}
          onChange={(e) => onSelectConfig(e.target.value)}
          className="appearance-none bg-zinc-900 border border-zinc-700 rounded-md pl-2.5 pr-7 py-1.5 text-xs text-zinc-200 hover:border-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
        >
          {configs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.label} · {config.model}
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

      <button
        type="button"
        onClick={() => setDraft(blankConfig())}
        className="text-xs px-2 py-1 rounded-md text-zinc-500 hover:text-violet-300 hover:bg-zinc-800/70 transition-colors"
      >
        Add model
      </button>
      {activeConfigId && (
        <button
          type="button"
          onClick={() => onDeleteConfig(activeConfigId)}
          className="text-xs px-2 py-1 rounded-md text-zinc-600 hover:text-red-300 hover:bg-red-950/40 transition-colors"
        >
          Remove
        </button>
      )}

      <div className="h-4 w-px bg-zinc-800" aria-hidden />

      <span className="text-[10px] uppercase tracking-wide text-zinc-600">Servers</span>
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
