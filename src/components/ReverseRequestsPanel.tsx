import { useEffect, useMemo, useState } from 'react';
import {
  getPendingReverseRequests,
  rejectPendingReverseRequest,
  resolvePendingReverseRequest,
  subscribePendingReverseRequests,
  type PendingReverseRequest,
} from '../lib/mcpReverseRequests';
import { runApprovedSampling } from '../lib/mcpSampling';
import { elicitationInitialValues, elicitationRequestedSchema } from '../lib/elicitationForm';
import type { LlmConfig } from '../lib/agent/types';
import type { ServerEntry } from '../types';
import { CodeBlock } from './CodeBlock';
import { McpRootsEditor } from './McpRootsEditor';
import { SchemaForm } from './SchemaForm';

interface Props {
  servers: ServerEntry[];
  /** First configured model server from the vault, if any. */
  samplingLlm?: LlmConfig | null;
}

function usePending(): PendingReverseRequest[] {
  const [items, setItems] = useState(() => getPendingReverseRequests());
  useEffect(() => subscribePendingReverseRequests(() => setItems(getPendingReverseRequests())), []);
  return items;
}

function RequestCard({
  item,
  serverName,
  samplingLlm,
}: {
  item: PendingReverseRequest;
  serverName: string;
  samplingLlm?: LlmConfig | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedSchema = item.kind === 'elicitation' ? elicitationRequestedSchema(item.params) : null;
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() =>
    requestedSchema ? elicitationInitialValues(requestedSchema) : { confirm: true },
  );

  async function approveSampling() {
    setBusy(true);
    setError(null);
    try {
      const result = samplingLlm
        ? await runApprovedSampling(item.params, samplingLlm)
        : {
            model: 'mcp-detective-stub',
            role: 'assistant' as const,
            content: { type: 'text' as const, text: 'Sampling approved (stub response).' },
          };
      resolvePendingReverseRequest(item.id, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function deny() {
    if (item.kind === 'elicitation') {
      resolvePendingReverseRequest(item.id, { action: 'decline' });
      return;
    }
    rejectPendingReverseRequest(item.id, 'Sampling denied by user');
  }

  function acceptElicitation() {
    resolvePendingReverseRequest(item.id, { action: 'accept', content: formValues });
  }

  const message =
    item.kind === 'elicitation' &&
    item.params &&
    typeof item.params === 'object' &&
    'message' in item.params
      ? String((item.params as { message?: unknown }).message ?? '')
      : '';

  return (
    <div className="rounded-lg border border-violet-800/60 bg-violet-950/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">
          {item.kind === 'sampling' ? 'Sampling request' : 'Elicitation request'}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{serverName}</span>
      </div>
      {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
      <CodeBlock code={JSON.stringify(item.params, null, 2)} lang="json" />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {item.kind === 'elicitation' ? (
        <>
          {requestedSchema ? (
            <SchemaForm
              schema={requestedSchema}
              values={formValues}
              onChange={(key, value) => setFormValues((v) => ({ ...v, [key]: value }))}
            />
          ) : (
            <p className="text-sm text-amber-200">
              No form schema in this request; decline or inspect params above.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !requestedSchema}
              onClick={acceptElicitation}
              className="px-3 py-1.5 text-xs rounded-md bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={deny}
              className="px-3 py-1.5 text-xs rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
            >
              Decline
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void approveSampling()}
            className="px-3 py-1.5 text-xs rounded-md bg-emerald-700 hover:bg-emerald-600 text-white"
          >
            Approve sampling
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={deny}
            className="px-3 py-1.5 text-xs rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

export function ReverseRequestsPanel({ servers, samplingLlm = null }: Props) {
  const pending = usePending();
  const names = useMemo(() => new Map(servers.map((s) => [s.id, s.name])), [servers]);

  return (
    <div className="h-full overflow-auto p-5 space-y-6">
      {pending.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No pending server requests. When a connected MCP server calls sampling, elicitation, or sends
          logging/progress notifications, they appear here or in the Protocol Inspector (inbound).
        </p>
      ) : (
        <div className="space-y-4">
          {pending.map((item) => (
            <RequestCard
              key={item.id}
              item={item}
              serverName={names.get(item.serverId) ?? item.serverId}
              samplingLlm={samplingLlm}
            />
          ))}
        </div>
      )}
      <McpRootsEditor />
    </div>
  );
}
