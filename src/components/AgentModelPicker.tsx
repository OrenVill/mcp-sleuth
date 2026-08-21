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

  if (draft) {
    return (
      <form
        data-testid="llm-config-form"
        className="space-y-2.5 max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveConfig(draft);
          setDraft(null);
        }}
      >
        <p className="text-[11px] text-zinc-500">
          Credentials are stored in the encrypted vault, alongside your servers.
        </p>

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

        <div className="flex gap-1.5">
          <button
            type="submit"
            className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            Save model
          </button>
          {configs.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        data-testid="llm-config-select"
        value={activeConfigId ?? ''}
        onChange={(e) => onSelectConfig(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
      >
        {configs.map((config) => (
          <option key={config.id} value={config.id}>
            {config.label} · {config.model}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setDraft(blankConfig())}
        className="text-xs text-zinc-500 hover:text-violet-400 transition-colors"
      >
        Add model
      </button>
      {activeConfigId && (
        <button
          type="button"
          onClick={() => onDeleteConfig(activeConfigId)}
          className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      )}

      <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-600">Servers</span>
      {connected.map((server) => (
        <label key={server.id} className="flex items-center gap-1 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            checked={selectedServerIds.includes(server.id)}
            onChange={() => onToggleServer(server.id)}
          />
          {server.name}
        </label>
      ))}
    </div>
  );
}
