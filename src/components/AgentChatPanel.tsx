import { useCallback, useState, type FormEvent } from 'react';
import type { ServerEntry } from '../types';
import { addInvocationObservation } from '../lib/observationJournal';
import { updateObservationJournal } from '../lib/observationJournalStore';
import type { LlmConfig } from '../lib/agent/types';
import { useProtocolTraces } from './useProtocolTraces';
import { AgentModelPicker } from './AgentModelPicker';
import { AgentTranscript } from './AgentTranscript';
import { ToolCallApproval } from './ToolCallApproval';
import { useAgentRun } from './useAgentRun';

interface Props {
  servers: ServerEntry[];
  llmConfigs: LlmConfig[];
  onSaveLlmConfigs: (configs: LlmConfig[]) => void;
  /** The server the user is currently investigating; the default chat scope. */
  activeServerId: string | null;
  onClose: () => void;
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
        ? `Captured ${count} call(s) as a replay suite.`
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

  return (
    <div
      data-testid="agent-chat-panel"
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col"
    >
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Back to servers
        </button>
        <span className="text-sm font-medium text-zinc-200">Agent Chat</span>
        <div className="ml-auto">
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
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <section className="flex-1 flex flex-col min-w-0 border-r border-zinc-800">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {run.collisions.map((collision) => (
              <p
                key={`${collision.llmName}-${collision.droppedServerId}`}
                data-testid="tool-collision-warning"
                className="text-[11px] text-amber-400"
              >
                Two selected servers export a tool named{' '}
                <span className="font-mono">{collision.llmName}</span>. Only{' '}
                {run.toolCount > 0 ? 'the first' : 'one'} is exposed —{' '}
                {collision.droppedServerName}&rsquo;s copy is hidden from the model.
              </p>
            ))}

            <AgentTranscript
              messages={run.messages}
              streamingText={run.streamingText}
              onRecordObservation={recordObservation}
            />

            {run.pending && (
              <ToolCallApproval
                call={run.pending.call}
                verdict={run.pending.verdict}
                serverName={run.pending.serverName}
                onDecide={run.decide}
              />
            )}

            {run.error && (
              <p data-testid="agent-error" className="text-xs text-red-400">
                {run.error}
              </p>
            )}
            {notice && <p className="text-[11px] text-violet-300">{notice}</p>}
          </div>

          <form onSubmit={submit} className="border-t border-zinc-800 p-3 flex gap-2">
            <input
              data-testid="agent-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!config || selectedServerIds.length === 0}
              placeholder={
                !config
                  ? 'Add a model to start'
                  : selectedServerIds.length === 0
                    ? 'Select a connected server'
                    : 'Ask something…'
              }
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />
            {run.running ? (
              <button
                type="button"
                onClick={run.stop}
                className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                data-testid="agent-send"
                disabled={!config || selectedServerIds.length === 0}
                className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            )}
          </form>
        </section>

        <aside className="w-80 shrink-0 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Live trace</span>
            <button
              type="button"
              data-testid="capture-replay-suite"
              onClick={capture}
              className="ml-auto text-[11px] text-zinc-500 hover:text-violet-400 transition-colors"
            >
              Capture as suite
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {runTraces.length === 0 ? (
              <p className="text-[11px] text-zinc-600">No tool calls yet.</p>
            ) : (
              runTraces.map((trace) => (
                <div key={trace.id} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={
                      trace.status === 'error'
                        ? 'text-red-400'
                        : trace.status === 'ok'
                          ? 'text-green-400'
                          : 'text-zinc-500'
                    }
                  >
                    ●
                  </span>
                  <span className="font-mono text-zinc-400 truncate">{trace.method}</span>
                  {typeof trace.durationMs === 'number' && (
                    <span className="ml-auto text-zinc-600">{trace.durationMs}ms</span>
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
