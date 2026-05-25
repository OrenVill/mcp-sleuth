import { useEffect, useMemo, useState } from 'react';
import {
  buildReplayCaseFromTrace,
  runReplaySuite,
  type ReplayCase,
  type ReplayCaseResult,
  type ReplaySuite,
} from '../lib/replaySuites';
import { getProtocolTraces, subscribeProtocolTraces } from '../lib/protocolTrace';
import type { ProtocolTraceEvent } from '../lib/protocolTrace';
import type { ServerEntry, ToolResult } from '../types';
import { CodeBlock } from './CodeBlock';

interface Props {
  servers: ServerEntry[];
  onReplayToolCall: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
}

let sessionSuites: ReplaySuite[] = [];
let sessionSelectedSuiteId: string | null = null;
let sessionResultsBySuite: Record<string, ReplayCaseResult[]> = {};

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

function makeSuite(name: string): ReplaySuite {
  const trimmed = name.trim() || 'Untitled replay suite';
  return {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt: Date.now(),
    cases: [],
  };
}

function resultClass(status: ReplayCaseResult['status']): string {
  return status === 'pass'
    ? 'border-emerald-900/60 bg-emerald-950/20 text-emerald-200'
    : 'border-red-900/60 bg-red-950/30 text-red-200';
}

export function ReplaySuitesPanel({ servers, onReplayToolCall }: Props) {
  const traces = useProtocolTraces();
  const [suiteName, setSuiteName] = useState('Docs server smoke test');
  const [suites, setSuites] = useState<ReplaySuite[]>(() => sessionSuites);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(() => sessionSelectedSuiteId);
  const [resultsBySuite, setResultsBySuite] = useState<Record<string, ReplayCaseResult[]>>(
    () => sessionResultsBySuite,
  );
  const [runningSuiteId, setRunningSuiteId] = useState<string | null>(null);

  const serverNames = useMemo(
    () => new Map(servers.map((server) => [server.id, server.name])),
    [servers],
  );
  const selectedSuite = suites.find((suite) => suite.id === selectedSuiteId) ?? suites[0] ?? null;
  const results = selectedSuite ? resultsBySuite[selectedSuite.id] ?? [] : [];
  const replayableCases = traces
    .map((trace) => buildReplayCaseFromTrace(trace, serverNames.get(trace.serverId)))
    .filter((testCase): testCase is ReplayCase => Boolean(testCase));

  useEffect(() => {
    sessionSuites = suites;
  }, [suites]);

  useEffect(() => {
    sessionSelectedSuiteId = selectedSuiteId;
  }, [selectedSuiteId]);

  useEffect(() => {
    sessionResultsBySuite = resultsBySuite;
  }, [resultsBySuite]);

  function createSuite() {
    const next = makeSuite(suiteName);
    setSuites((current) => [next, ...current]);
    setSelectedSuiteId(next.id);
  }

  function addCase(testCase: ReplayCase) {
    if (!selectedSuite) {
      const next = { ...makeSuite(suiteName), cases: [testCase] };
      setSuites((current) => [next, ...current]);
      setSelectedSuiteId(next.id);
      return;
    }

    setSuites((current) =>
      current.map((candidate) =>
        candidate.id === selectedSuite.id && !candidate.cases.some((item) => item.id === testCase.id)
          ? { ...candidate, cases: [...candidate.cases, testCase] }
          : candidate,
      ),
    );
  }

  function removeCase(caseId: string) {
    if (!selectedSuite) return;
    setSuites((current) =>
      current.map((suite) =>
        suite.id === selectedSuite.id
          ? { ...suite, cases: suite.cases.filter((testCase) => testCase.id !== caseId) }
          : suite,
      ),
    );
  }

  function deleteSuite() {
    if (!selectedSuite) return;
    setSuites((current) => current.filter((suite) => suite.id !== selectedSuite.id));
    setSelectedSuiteId(null);
  }

  async function replaySuite() {
    if (!selectedSuite || selectedSuite.cases.length === 0) return;
    setRunningSuiteId(selectedSuite.id);
    const nextResults = await runReplaySuite(selectedSuite, async (testCase) => {
      const startedAt = Date.now();
      try {
        const result = await onReplayToolCall(testCase.serverId, testCase.toolName, testCase.args);
        return {
          status: 'ok',
          result,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        };
      }
    });
    setResultsBySuite((current) => ({ ...current, [selectedSuite.id]: nextResults }));
    setRunningSuiteId(null);
  }

  return (
    <div className="h-full min-h-0 grid grid-cols-[22rem_1fr] bg-zinc-950">
      <aside className="border-r border-zinc-800/80 overflow-y-auto p-3 space-y-4">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <label className="block text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
            Suite name
          </label>
          <input
            value={suiteName}
            onChange={(event) => setSuiteName(event.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm"
          />
          <button
            type="button"
            onClick={createSuite}
            className="mt-3 w-full px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium text-white transition-colors"
          >
            New suite
          </button>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
              Suites
            </h3>
            <span className="text-[11px] text-zinc-600">{suites.length}</span>
          </div>
          <div className="space-y-1.5">
            {suites.length === 0 ? (
              <p className="text-xs text-zinc-600">Create a suite, then add successful tool calls.</p>
            ) : (
              suites.map((suite) => (
                <button
                  key={suite.id}
                  type="button"
                  onClick={() => setSelectedSuiteId(suite.id)}
                  className={[
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    suite.id === selectedSuite?.id
                      ? 'border-violet-700/70 bg-violet-950/25'
                      : 'border-zinc-800/70 bg-zinc-950/30 hover:border-zinc-700',
                  ].join(' ')}
                >
                  <div className="text-sm text-zinc-100 truncate">{suite.name}</div>
                  <div className="text-[11px] text-zinc-500 mt-1">{suite.cases.length} calls</div>
                </button>
              ))
            )}
          </div>
        </section>

        <section>
          <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500 mb-2">
            Successful tool calls
          </h3>
          <div className="space-y-1.5">
            {replayableCases.length === 0 ? (
              <p className="text-xs text-zinc-600">Run a tool successfully to make it available here.</p>
            ) : (
              replayableCases.map((testCase) => (
                <div key={testCase.id} className="rounded-lg border border-zinc-800/70 bg-zinc-950/30 p-3">
                  <div className="font-mono text-xs text-zinc-100 truncate">{testCase.toolName}</div>
                  <div className="mt-1 text-[11px] text-zinc-500 truncate">
                    {testCase.serverName ?? testCase.serverId}
                  </div>
                  <button
                    type="button"
                    onClick={() => addCase(testCase)}
                    className="mt-2 text-[11px] px-2 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
                  >
                    Add to suite
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </aside>

      <main className="min-w-0 overflow-y-auto p-5">
        {!selectedSuite ? (
          <div className="h-full grid place-items-center text-center px-8">
            <div className="max-w-sm">
              <p className="text-sm text-zinc-300">No replay suite selected.</p>
              <p className="text-xs text-zinc-600 mt-1">
                Create a suite and add successful manual tool calls from the left.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-zinc-500">Replay Suite</div>
                <h3 className="text-2xl font-semibold text-zinc-50 tracking-tight mt-1">
                  {selectedSuite.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Saved in this browser session only. Replays require the target server to still be connected.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void replaySuite()}
                  disabled={selectedSuite.cases.length === 0 || runningSuiteId === selectedSuite.id}
                  className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-wait text-white text-sm font-medium transition-colors"
                >
                  {runningSuiteId === selectedSuite.id ? 'Replaying...' : 'Replay'}
                </button>
                <button
                  type="button"
                  onClick={deleteSuite}
                  className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-200 hover:border-red-800 text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <section>
              <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                Calls
              </h4>
              <div className="space-y-3">
                {selectedSuite.cases.length === 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-4 text-sm text-zinc-500">
                    Add successful tool calls to build this suite.
                  </div>
                ) : (
                  selectedSuite.cases.map((testCase) => (
                    <div key={testCase.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-mono text-sm text-zinc-100">{testCase.toolName}</div>
                          <div className="text-xs text-zinc-500 mt-1">
                            {testCase.serverName ?? testCase.serverId}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCase(testCase.id)}
                          className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
                            Arguments
                          </div>
                          <CodeBlock code={stringify(testCase.args)} lang="json" />
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
                            Expected result snapshot
                          </div>
                          <CodeBlock code={stringify(testCase.expectedResult)} lang="json" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {results.length > 0 && (
              <section>
                <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                  Replay Results
                </h4>
                <div className="space-y-3">
                  {results.map((result) => {
                    const testCase = selectedSuite.cases.find((candidate) => candidate.id === result.caseId);
                    return (
                      <div key={result.caseId} className={`rounded-xl border p-4 ${resultClass(result.status)}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-mono text-sm">{testCase?.toolName ?? result.caseId}</div>
                            <div className="text-[11px] opacity-80 mt-1">
                              {result.durationMs !== undefined ? `${result.durationMs}ms` : 'no duration'} ·{' '}
                              {result.differences.length} diffs
                            </div>
                          </div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold">{result.status}</span>
                        </div>
                        {result.error && <div className="mt-2 text-sm">{result.error}</div>}
                        {result.differences.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {result.differences.map((diff) => (
                              <div key={`${result.caseId}:${diff.path}`} className="rounded-lg border border-current/20 bg-black/20 p-2">
                                <div className="text-xs font-mono">{diff.path}</div>
                                <div className="mt-1 grid gap-2 md:grid-cols-2">
                                  <CodeBlock code={stringify(diff.left)} lang="json" />
                                  <CodeBlock code={stringify(diff.right)} lang="json" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
