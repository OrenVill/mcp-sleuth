import { useEffect, useMemo, useState } from 'react';
import { diffProtocolTraces, type ProtocolDiffEntry } from '../lib/protocolDiff';
import { clearProtocolTraces, getProtocolTraces, subscribeProtocolTraces } from '../lib/protocolTrace';
import type { ProtocolTraceEvent } from '../lib/protocolTrace';
import type { ServerEntry } from '../types';
import { CodeBlock } from './CodeBlock';

interface Props {
  servers: ServerEntry[];
}

const STATUS_CLASS: Record<ProtocolTraceEvent['status'], string> = {
  pending: 'border-amber-700/60 bg-amber-950/30 text-amber-300',
  ok: 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300',
  unsupported: 'border-sky-700/60 bg-sky-950/30 text-sky-300',
  error: 'border-red-700/60 bg-red-950/30 text-red-300',
};

function useProtocolTraces(): ProtocolTraceEvent[] {
  const [traces, setTraces] = useState(() => getProtocolTraces());

  useEffect(() => {
    return subscribeProtocolTraces(() => setTraces(getProtocolTraces()));
  }, []);

  return traces;
}

function stringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value, null, 2);
}

function traceSummary(trace: ProtocolTraceEvent): string {
  const payload = {
    method: trace.method,
    serverId: trace.serverId,
    status: trace.status,
    startedAt: new Date(trace.startedAt).toISOString(),
    durationMs: trace.durationMs,
    params: trace.params,
    result: trace.result,
    error: trace.error,
  };
  return JSON.stringify(payload, null, 2);
}

function DiffValue({ value }: { value: unknown }) {
  return (
    <code className="block whitespace-pre-wrap break-words rounded-md bg-zinc-950/70 border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
      {stringify(value)}
    </code>
  );
}

function DiffList({ diffs }: { diffs: ProtocolDiffEntry[] }) {
  if (diffs.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
        No differences found between these events.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {diffs.map((diff) => (
        <div key={`${diff.path}:${diff.kind}`} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-zinc-100">{diff.label}</div>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-mono">{diff.kind}</span>
          </div>
          <div className="mt-1 text-[11px] text-violet-300 font-mono">{diff.path}</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <DiffValue value={diff.left} />
            <DiffValue value={diff.right} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProtocolInspectorPanel({ servers }: Props) {
  const traces = useProtocolTraces();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diffIds, setDiffIds] = useState<string[]>([]);
  const serverNames = useMemo(
    () => new Map(servers.map((server) => [server.id, server.name])),
    [servers],
  );
  const selected = traces.find((trace) => trace.id === selectedId) ?? traces[0] ?? null;
  const diffTraces = diffIds
    .map((id) => traces.find((trace) => trace.id === id))
    .filter((trace): trace is ProtocolTraceEvent => Boolean(trace));
  const diffEntries = diffTraces.length === 2 ? diffProtocolTraces(diffTraces[0], diffTraces[1]) : [];

  function toggleDiffId(id: string) {
    setDiffIds((current) => {
      if (current.includes(id)) return current.filter((candidate) => candidate !== id);
      return [...current.slice(-1), id];
    });
  }

  if (traces.length === 0) {
    return (
      <div className="h-full grid place-items-center text-center px-8">
        <div className="max-w-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-zinc-600" aria-hidden>
              <path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm text-zinc-300">No protocol calls captured yet.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Connect a server, invoke a tool, read a resource, or fetch a prompt to populate the timeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 grid grid-cols-[22rem_1fr]">
      <aside className="border-r border-zinc-800/80 overflow-y-auto p-2">
        <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur">
          <div>
            <span className="text-[11px] text-zinc-500 font-mono">{traces.length} events</span>
            <div className="text-[10px] text-zinc-600">
              {diffIds.length === 2 ? 'Diff ready' : 'Select 2 for diff'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {diffIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDiffIds([])}
                className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
              >
                Reset diff
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDiffIds([]);
                clearProtocolTraces();
              }}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {traces.map((trace) => {
          const selectedTrace = trace.id === selected?.id;
          const selectedForDiff = diffIds.includes(trace.id);
          return (
            <div
              key={trace.id}
              className={[
                'rounded-lg border px-3 py-2 mb-1.5 transition-colors',
                selectedTrace
                  ? 'border-violet-700/70 bg-violet-950/25'
                  : 'border-zinc-800/70 bg-zinc-950/30 hover:border-zinc-700 hover:bg-zinc-900/70',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => setSelectedId(trace.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-zinc-100 truncate">{trace.method}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_CLASS[trace.status]}`}>
                    {trace.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                  <span className="truncate">{serverNames.get(trace.serverId) ?? trace.serverId}</span>
                  <span className="font-mono shrink-0">
                    {trace.durationMs !== undefined ? `${trace.durationMs}ms` : 'running'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => toggleDiffId(trace.id)}
                className={[
                  'mt-2 text-[11px] px-2 py-1 rounded-md border transition-colors',
                  selectedForDiff
                    ? 'border-violet-700 bg-violet-950/40 text-violet-200'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600',
                ].join(' ')}
              >
                {selectedForDiff ? `Diff ${diffIds.indexOf(trace.id) + 1}` : 'Select for diff'}
              </button>
            </div>
          );
        })}
      </aside>

      <main className="min-w-0 overflow-y-auto p-5">
        {diffTraces.length === 2 ? (
          <div className="space-y-5">
            <div>
              <div className="text-xs text-zinc-500">Protocol Diff</div>
              <h3 className="text-xl font-semibold text-zinc-50 mt-1">
                {diffEntries.length} {diffEntries.length === 1 ? 'change' : 'changes'}
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Comparing {diffTraces[0].method} against {diffTraces[1].method}
              </p>
            </div>

            <section className="grid gap-4 xl:grid-cols-2">
              {diffTraces.map((trace, index) => (
                <div key={trace.id}>
                  <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                    Event {index + 1}
                  </h4>
                  <CodeBlock code={traceSummary(trace)} lang="json" />
                </div>
              ))}
            </section>

            <section>
              <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                Differences
              </h4>
              <DiffList diffs={diffEntries} />
            </section>
          </div>
        ) : selected && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-zinc-500">
                  {serverNames.get(selected.serverId) ?? selected.serverId}
                </div>
                <h3 className="text-xl font-semibold text-zinc-50 font-mono mt-1">{selected.method}</h3>
                <div className="text-[11px] text-zinc-500 mt-1">
                  {new Date(selected.startedAt).toLocaleTimeString()} ·{' '}
                  {selected.durationMs !== undefined ? `${selected.durationMs}ms` : 'running'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(traceSummary(selected));
                }}
                className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
              >
                Copy event
              </button>
            </div>

            <section>
              <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                Params
              </h4>
              <CodeBlock code={stringify(selected.params)} lang="json" />
            </section>

            {selected.error ? (
              <section>
                <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-red-300 mb-2">
                  Error
                </h4>
                <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                  {selected.error}
                </div>
              </section>
            ) : (
              <section>
                <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                  Result
                </h4>
                <CodeBlock code={stringify(selected.result)} lang="json" />
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
