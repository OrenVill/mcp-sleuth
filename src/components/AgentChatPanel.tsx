import { useCallback, useState, type FormEvent } from 'react';
import type { ServerEntry } from '../types';
import { addInvocationObservation } from '../lib/observationJournal';
import { updateObservationJournal } from '../lib/observationJournalStore';
import type { LlmConfig } from '../lib/agent/types';
import { useProtocolTraces } from './useProtocolTraces';
import { AgentModelPicker } from './AgentModelPicker';
import { AgentTranscript } from './AgentTranscript';
import { ToolCallApproval } from './ToolCallApproval';
import { WindowControls } from './WindowControls';
import { useAgentRun } from './useAgentRun';

interface Props {
  servers: ServerEntry[];
  llmConfigs: LlmConfig[];
  onSaveLlmConfigs: (configs: LlmConfig[]) => void;
  /** The server the user is currently investigating; the default chat scope. */
  activeServerId: string | null;
  onClose: () => void;
}

/** The conversation and the composer share one column so text keeps a readable measure. */
const COLUMN = 'w-full max-w-3xl mx-auto px-6';

function EmptyState({ toolCount, ready }: { toolCount: number; ready: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-16">
      <div className="w-10 h-10 rounded-xl border border-zinc-800 bg-zinc-900/60 flex items-center justify-center">
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-zinc-600" aria-hidden>
          <path
            d="M2.5 3.5h11v7h-6l-3.5 2.5v-2.5h-1.5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-zinc-300">
          {ready ? 'Ask the model to use this server' : 'Not ready yet'}
        </p>
        <p className="text-xs text-zinc-600 max-w-xs">
          {ready
            ? `${toolCount} tool${toolCount === 1 ? '' : 's'} exposed. Every call is shown to you for approval before it runs.`
            : 'Choose a model and at least one connected server to begin.'}
        </p>
      </div>
    </div>
  );
}

export function AgentChatPanel({
  servers,
  llmConfigs,
  onSaveLlmConfigs,
  activeServerId,
  onClose,
}: Props) {
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>(
    activeServerId ? [activeServerId] : [],
  );
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const traces = useProtocolTraces();
  /**
   * Derived rather than synced in an effect: with no explicit choice — at first
   * paint, or right after the active config was deleted — the first config is
   * the active one. An effect would set the same value one render later.
   */
  const effectiveConfigId = activeConfigId ?? llmConfigs[0]?.id ?? null;
  const config = llmConfigs.find((c) => c.id === effectiveConfigId) ?? null;
  const run = useAgentRun(servers, config, selectedServerIds);

  const ready = Boolean(config) && selectedServerIds.length > 0;

  const recordObservation = useCallback(
    (toolName: string, note: string) => {
      const serverId = selectedServerIds[0];
      const server = servers.find((s) => s.id === serverId);
      if (!server) return;
      updateObservationJournal(server, (journal) =>
        addInvocationObservation(journal, { toolName, note, flagged: false }),
      );
      setNotice('Recorded in the Observation Journal.');
    },
    [selectedServerIds, servers],
  );

  const capture = useCallback(() => {
    const count = run.captureAsSuite(`Agent run ${new Date().toLocaleTimeString()}`);
    setNotice(
      count > 0
        ? `Captured ${count} call${count === 1 ? '' : 's'} as a replay suite.`
        : 'No successful tool calls in this run to capture.',
    );
  }, [run]);

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput('');
      setNotice(null);
      void run.send(text);
    },
    [input, run],
  );

  const runTraces = traces.filter((trace) => trace.method === 'tools/call').slice(0, 40);
  const hasConversation = run.messages.length > 0 || run.streamingText.length > 0;

  return (
    <div
      data-testid="agent-chat-panel"
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col"
    >
      {/*
        `app-header` is load-bearing on the desktop build, not decoration: it is
        the class index.css turns into the window's drag region. This overlay
        covers the real header, so without it the frameless window cannot be
        moved at all while the chat is open. WindowControls below restores
        minimise/maximise/close for the same reason.
      */}
      <header className="app-header shrink-0 flex items-center gap-3 pl-4 pr-3 h-14 border-b border-zinc-800 bg-zinc-900/40">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-xs px-2 py-1 -ml-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
            <path
              d="M10 3.5 5.5 8l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Servers
        </button>

        <div className="h-4 w-px bg-zinc-800" aria-hidden />

        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-100">Agent Chat</span>
          {ready && (
            <span className="text-[11px] text-zinc-600 truncate">
              {run.toolCount} tool{run.toolCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 min-w-0">
          <AgentModelPicker
            configs={llmConfigs}
            activeConfigId={effectiveConfigId}
            servers={servers}
            selectedServerIds={selectedServerIds}
            onSelectConfig={setActiveConfigId}
            onSaveConfig={(next) => {
              const rest = llmConfigs.filter((c) => c.id !== next.id);
              onSaveLlmConfigs([...rest, next]);
              setActiveConfigId(next.id);
            }}
            onDeleteConfig={(id) => {
              onSaveLlmConfigs(llmConfigs.filter((c) => c.id !== id));
              setActiveConfigId(null);
            }}
            onToggleServer={(serverId) =>
              setSelectedServerIds((current) =>
                current.includes(serverId)
                  ? current.filter((id) => id !== serverId)
                  : [...current, serverId],
              )
            }
          />
          <WindowControls />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className={`${COLUMN} py-6 space-y-4 flex-1 flex flex-col`}>
              {run.collisions.map((collision) => (
                <p
                  key={`${collision.llmName}-${collision.droppedServerId}`}
                  data-testid="tool-collision-warning"
                  className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2"
                >
                  Two selected servers export a tool named{' '}
                  <span className="font-mono text-amber-200">{collision.llmName}</span>. Only the
                  first is exposed — {collision.droppedServerName}&rsquo;s copy is hidden from the
                  model.
                </p>
              ))}

              {hasConversation ? (
                <AgentTranscript
                  messages={run.messages}
                  streamingText={run.streamingText}
                  onRecordObservation={recordObservation}
                />
              ) : (
                run.collisions.length === 0 && (
                  <div className="flex-1 min-h-0">
                    <EmptyState toolCount={run.toolCount} ready={ready} />
                  </div>
                )
              )}

              {run.pending && (
                <ToolCallApproval
                  call={run.pending.call}
                  verdict={run.pending.verdict}
                  serverName={run.pending.serverName}
                  onDecide={run.decide}
                />
              )}

              {run.error && (
                <p
                  data-testid="agent-error"
                  className="text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2"
                >
                  {run.error}
                </p>
              )}
              {notice && (
                <p className="text-[11px] text-violet-300/90 bg-violet-950/30 border border-violet-900/50 rounded-lg px-3 py-2">
                  {notice}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/30 py-4">
            <form onSubmit={submit} className={COLUMN}>
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1.5 focus-within:border-violet-600 transition-colors">
                <input
                  data-testid="agent-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={!ready}
                  placeholder={
                    !config
                      ? 'Add a model to start'
                      : selectedServerIds.length === 0
                        ? 'Select a connected server'
                        : 'Ask something…'
                  }
                  className="flex-1 min-w-0 bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:cursor-not-allowed"
                  /*
                   * index.css gives every focused input a violet ring. Here the
                   * wrapper already draws it, so the input's own ring would nest
                   * one rectangle inside another. That rule is un-layered, which
                   * beats any Tailwind utility, so an inline style is the
                   * override that actually wins.
                   */
                  style={{ boxShadow: 'none' }}
                />
                {run.running ? (
                  <button
                    type="button"
                    onClick={run.stop}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    data-testid="agent-send"
                    disabled={!ready || input.trim().length === 0}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                )}
              </div>
              <p className="mt-2 text-[10px] text-zinc-600">
                Every tool call is approved by you before it runs. Transcripts are never saved.
              </p>
            </form>
          </div>
        </section>

        <aside className="w-72 shrink-0 flex flex-col min-h-0 border-l border-zinc-800 bg-zinc-900/20">
          <div className="shrink-0 px-3 h-11 border-b border-zinc-800 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Live trace</span>
            {runTraces.length > 0 && (
              <span className="text-[10px] text-zinc-600 tabular-nums">{runTraces.length}</span>
            )}
            <button
              type="button"
              data-testid="capture-replay-suite"
              onClick={capture}
              disabled={runTraces.length === 0}
              className="ml-auto text-[11px] text-zinc-500 hover:text-violet-400 disabled:opacity-40 disabled:hover:text-zinc-500 transition-colors"
            >
              Capture as suite
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {runTraces.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-zinc-600">No tool calls yet.</p>
            ) : (
              runTraces.map((trace) => (
                <div
                  key={trace.id}
                  className="flex items-center gap-2 text-[11px] rounded-md px-2 py-1.5 hover:bg-zinc-800/40 transition-colors"
                >
                  <span
                    className={
                      trace.status === 'error'
                        ? 'text-red-400'
                        : trace.status === 'ok'
                          ? 'text-green-400'
                          : 'text-zinc-600'
                    }
                    aria-hidden
                  >
                    ●
                  </span>
                  <span className="font-mono text-zinc-400 truncate">{trace.method}</span>
                  {typeof trace.durationMs === 'number' && (
                    <span className="ml-auto shrink-0 text-zinc-600 tabular-nums">
                      {trace.durationMs}ms
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
