import { useState } from 'react';
import { SchemaForm } from './SchemaForm';
import { MarkdownPreview } from './MarkdownPreview';
import { ResultPane } from './ResultPane';
import { DiscoveryHeader } from './DiscoveryHeader';
import { CallHistory } from './CallHistory';
import { invokeMaybeDiscovered } from '../lib/discovery/invoke';
import { callTool } from '../lib/mcpClient';
import { appendRecord, loadHistory, clearHistory } from '../lib/history';
import type { CallRecord } from '../lib/history';
import type { DiscoveredTool, DiscoveryRun, MetaToolBinding, ServerEntry, ToolDef, ToolResult } from '../types';

interface Props {
  server: ServerEntry | null;
  tool: ToolDef | null;
  metaBinding: MetaToolBinding | null;
  discoveryRun: DiscoveryRun | null;
  onDiscover: (metaToolName: string, opts?: { alphabetSweep?: boolean }) => void;
  onStop: (metaToolName: string) => void;
  onOpenSchemaLab: () => void;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 grid place-items-center text-zinc-500 bg-zinc-950/20">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-zinc-600" aria-hidden>
            <path d="M9 19l-7-7 7-7M14 5l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-sm">{children}</p>
      </div>
    </main>
  );
}

export function ToolDetail({ server, tool, metaBinding, discoveryRun, onDiscover, onStop, onOpenSchemaLab }: Props) {
  const sessionKey = `${server?.id ?? 'none'}:${tool?.name ?? 'none'}`;
  return (
    <ToolDetailSession
      key={sessionKey}
      server={server}
      tool={tool}
      metaBinding={metaBinding}
      discoveryRun={discoveryRun}
      onDiscover={onDiscover}
      onStop={onStop}
      onOpenSchemaLab={onOpenSchemaLab}
    />
  );
}

function ToolDetailSession({ server, tool, metaBinding, discoveryRun, onDiscover, onStop, onOpenSchemaLab }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ToolResult | null>(null);
  /** Bumps when a new tool result arrives so ResultPane remounts (formatted vs raw defaults to formatted). */
  const [resultEpoch, setResultEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CallRecord[]>(() =>
    loadHistory().filter(
      (r) => r.serverId === server?.id && r.toolName === tool?.name,
    ),
  );

  if (!server) {
    return <EmptyState>Select a server from the left to begin.</EmptyState>;
  }
  if (!tool) {
    return (
      <EmptyState>
        {server.status === 'connected'
          ? 'Pick a tool to invoke.'
          : `Connect to ${server.name} to start exploring tools.`}
      </EmptyState>
    );
  }

  const cleanedArgs = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined && v !== ''),
  );

  async function run() {
    if (!tool || !server) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const startMs = Date.now();
    let callResult: ToolResult | undefined;
    try {
      const r = await invokeMaybeDiscovered({
        callTool: (n, a) => callTool(server.id, n, a),
        tool,
        args: cleanedArgs,
        metaTools: server.metaTools ?? [],
      });
      callResult = r;
      setResult(r);
      setResultEpoch((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      const durationMs = Date.now() - startMs;
      const record: CallRecord = {
        id: crypto.randomUUID(),
        timestamp: startMs,
        serverId: server.id,
        serverName: server.name,
        toolName: tool.name,
        args: cleanedArgs,
        result: callResult,
        durationMs,
        isDiscovered: !!(tool as DiscoveredTool).source,
      };
      appendRecord(record);
      setHistory(loadHistory().filter((r) => r.serverId === server?.id && r.toolName === tool?.name));
      setLoading(false);
    }
  }

  function handleReplay(args: Record<string, unknown>) {
    setValues(args);
  }

  const description = (tool.description ?? '').trim();

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        {metaBinding && discoveryRun && (
          <DiscoveryHeader
            meta={metaBinding}
            run={discoveryRun}
            onDiscover={(opts) => onDiscover(metaBinding.toolName, opts)}
            onStop={() => onStop(metaBinding.toolName)}
          />
        )}
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">{server.name}</span>
            <span className="text-zinc-700">/</span>
            <span className="text-violet-400 font-mono">{tool.name}</span>
          </div>
          <h1 className="text-2xl font-semibold text-zinc-50 tracking-tight font-mono">
            {tool.name}
          </h1>
          {description && (
            <MarkdownPreview source={description} />
          )}
        </header>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
              Arguments
            </h2>
            <button
              type="button"
              onClick={onOpenSchemaLab}
              className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            >
              Schema Lab
            </button>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5">
            <SchemaForm
              schema={tool.inputSchema}
              values={values}
              onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
            />
            <div className="mt-5 pt-4 border-t border-zinc-800/60 flex items-center gap-3">
              <button
                type="button"
                onClick={run}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-50 disabled:cursor-wait text-white text-sm font-medium shadow-sm shadow-violet-950/50 transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Running…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
                      <path d="M4 2.5v11l9-5.5-9-5.5z" />
                    </svg>
                    Run tool
                  </>
                )}
              </button>
              <code className="text-[11px] text-zinc-500 font-mono truncate flex-1">
                {Object.keys(cleanedArgs).length > 0
                  ? JSON.stringify(cleanedArgs)
                  : '{}'}
              </code>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-3">
            Result
          </h2>
          <ResultPane key={resultEpoch} result={result} error={error} loading={loading} />
        </section>

        <CallHistory
          history={history}
          onReplay={handleReplay}
          onClear={() => { clearHistory(); setHistory([]); }}
        />
      </div>
    </main>
  );
}
