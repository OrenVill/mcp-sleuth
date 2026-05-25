import { useEffect, useMemo, useState } from 'react';
import { clearProtocolTraces, getProtocolTraces, subscribeProtocolTraces } from '../lib/protocolTrace';
import type { ProtocolTraceEvent } from '../lib/protocolTrace';
import type { ServerEntry } from '../types';
import { CodeBlock } from './CodeBlock';

interface Props {
  open: boolean;
  servers: ServerEntry[];
  onClose: () => void;
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

export function ProtocolInspector({ open, servers, onClose }: Props) {
  const traces = useProtocolTraces();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const serverNames = useMemo(
    () => new Map(servers.map((server) => [server.id, server.name])),
    [servers],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const selected = traces.find((trace) => trace.id === selectedId) ?? traces[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-5xl mx-4 h-[82vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Protocol Inspector</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              In-memory MCP call timeline for this browser session.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500 font-mono">{traces.length} events</span>
            <button
              type="button"
              onClick={() => clearProtocolTraces()}
              disabled={traces.length === 0}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 transition-colors rounded-md p-1 hover:bg-zinc-800"
              aria-label="Close protocol inspector"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden>
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
        </div>

        {traces.length === 0 ? (
          <div className="flex-1 grid place-items-center text-center px-8">
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
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-[22rem_1fr]">
            <aside className="border-r border-zinc-800/80 overflow-y-auto p-2">
              {traces.map((trace) => {
                const selectedTrace = trace.id === selected?.id;
                return (
                  <button
                    key={trace.id}
                    type="button"
                    onClick={() => setSelectedId(trace.id)}
                    className={[
                      'w-full text-left rounded-lg border px-3 py-2 mb-1.5 transition-colors',
                      selectedTrace
                        ? 'border-violet-700/70 bg-violet-950/25'
                        : 'border-zinc-800/70 bg-zinc-950/30 hover:border-zinc-700 hover:bg-zinc-900/70',
                    ].join(' ')}
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
                );
              })}
            </aside>

            <main className="min-w-0 overflow-y-auto p-5">
              {selected && (
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
        )}
      </div>
    </div>
  );
}
