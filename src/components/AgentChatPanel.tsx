import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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

/** Milliseconds, but readable once a call runs into seconds. */
function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** The tool a `tools/call` trace targeted, when the params carry one. */
function toolNameOf(trace: { params?: unknown }): string | null {
  const params = trace.params;
  if (!params || typeof params !== 'object') return null;
  const name = (params as { name?: unknown }).name;
  return typeof name === 'string' ? name : null;
}

function EmptyState({
  toolCount,
  ready,
  hasConnectedServer,
  onClose,
}: {
  toolCount: number;
  ready: boolean;
  hasConnectedServer: boolean;
  onClose: () => void;
}) {
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
          {ready
            ? 'Ask the model to use this server'
            : hasConnectedServer
              ? 'Not ready yet'
              : 'No connected MCP server'}
        </p>
        <p className="text-xs text-zinc-600 max-w-xs">
          {ready
            ? `${toolCount} tool${toolCount === 1 ? '' : 's'} exposed. Every call is shown to you for approval before it runs.`
            : hasConnectedServer
              ? 'Pick a model, and tick at least one server under MCP above.'
              : 'The chat drives a model against a server\u2019s tools, so it needs one connected first.'}
        </p>
      </div>
      {/*
        Without this the chat is a dead end: the server list lives behind the
        overlay, so there is no way to act on the message above from in here.
      */}
      {!hasConnectedServer && (
        <button
          type="button"
          data-testid="agent-connect-a-server"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition-colors"
        >
          Connect a server
        </button>
      )}
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
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>(() => {
    const connected = servers.filter((s) => s.status === 'connected');
    // The server being investigated, when it is actually connected; otherwise
    // the only connected one, since there is nothing to disambiguate.
    if (activeServerId && connected.some((s) => s.id === activeServerId)) {
      return [activeServerId];
    }
    return connected.length === 1 ? [connected[0].id] : [];
  });
  const [input, setInput] = useState('');
  /**
   * Text typed while a run was in flight. `send` refuses mid-run, so without
   * this the message would be dropped between the composer clearing and the
   * refusal — it is held here and sent the moment the run ends.
   */
  const [queued, setQueued] = useState<string | null>(null);
  /** Mirrors `queued` so the finishing run can read it without a stale closure. */
  const queuedRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [traceFilter, setTraceFilter] = useState<'all' | 'failed'>('all');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Whether the reader is parked at the bottom, sampled before each update. */
  const atBottomRef = useRef(true);
  /*
   * The same fact as `atBottomRef`, kept in state only so the jump-to-latest
   * pill can render. The ref stays the source of truth for the autoscroll
   * effect, which must read it during a commit rather than a render behind.
   */
  const [atBottom, setAtBottom] = useState(true);
  const wasRunningRef = useRef(false);
  const focusedOnceRef = useRef(false);

  const traces = useProtocolTraces();
  /**
   * Derived rather than synced in an effect: with no explicit choice — at first
   * paint, or right after the active config was deleted — the first config is
   * the active one. An effect would set the same value one render later.
   */
  const effectiveConfigId = activeConfigId ?? llmConfigs[0]?.id ?? null;
  const config = llmConfigs.find((c) => c.id === effectiveConfigId) ?? null;
  const run = useAgentRun(servers, config, selectedServerIds);

  const connectedIds = useMemo(
    () => servers.filter((s) => s.status === 'connected').map((s) => s.id),
    [servers],
  );
  /*
   * Connectivity is part of readiness, not just selection. buildToolCatalog
   * only exposes tools from connected servers, so a selected-but-disconnected
   * server would enable the composer and then send the model out with no tools
   * at all.
   */
  const ready =
    Boolean(config) && selectedServerIds.some((id) => connectedIds.includes(id));
  const approvalOpen = run.pending !== null;

  /*
   * Follow the conversation as it grows, but only when the reader is already at
   * the bottom — yanking the viewport while they are scrolled up reading an
   * earlier tool result would be worse than not following at all.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [run.messages, run.streamingText, run.pending, run.running]);

  /* A confirmation that never leaves is just clutter. */
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  /*
   * Open in the composer, and return to it when a run ends so the follow-up
   * needs no click. Never while it is disabled: focusing a disabled control does
   * nothing except take focus away from whatever the reader was using.
   */
  useEffect(() => {
    const runEnded = wasRunningRef.current && !run.running;
    wasRunningRef.current = run.running;
    /*
     * The mount pass is spent whether or not it could focus anything. Keeping
     * it alive until `ready` first turns true would fire this the moment the
     * user ticks their first server — inside the MCP scope popover — and pull
     * focus straight out from under them.
     */
    const onMount = !focusedOnceRef.current;
    focusedOnceRef.current = true;
    if (!ready) return;
    if (runEnded || onMount) inputRef.current?.focus();
  }, [ready, run.running]);

  /*
   * Escape closes the chat, with two exceptions.
   *
   * `Select` and `Popover` portal their layer to the body and close themselves
   * on Escape without stopping propagation, so a keypress meant for an open
   * model picker would otherwise close the whole overlay underneath it. Their
   * portals are direct children of the body, which is what the query below
   * looks for.
   *
   * An open approval card is the other: it is a security gate, and dismissing
   * one with a stray keypress is not a decision the user made.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || approvalOpen) return;
      if (document.querySelector('body > [role="listbox"], body > [role="dialog"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [approvalOpen, onClose]);

  /* Grow with the content; the height cap in the style below turns it into an
     internal scroll rather than a composer that eats the transcript. */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

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

  const enqueue = useCallback((text: string) => {
    // Two messages typed during one run are joined rather than the second
    // replacing the first: losing typed text is the bug this queue exists to
    // fix, so it must not reappear inside the queue itself.
    queuedRef.current = queuedRef.current ? `${queuedRef.current}\n${text}` : text;
    setQueued(queuedRef.current);
  }, []);

  const clearQueue = useCallback(() => {
    queuedRef.current = null;
    setQueued(null);
  }, []);

  /*
   * Send, then drain whatever was typed while that run was in flight.
   *
   * The queue is drained here rather than from an effect watching `queued`
   * because `run.send` resolves exactly when the run is over, which is the
   * event we actually want: no effect can fire twice for one queued message,
   * and this `send` closure is known to pass its own in-flight guard, so the
   * queued text cannot be swallowed the way an unqueued one was.
   */
  const dispatch = useCallback(
    async (first: string) => {
      let text: string | null = first;
      while (text) {
        await run.send(text);
        text = queuedRef.current;
        if (text) clearQueue();
      }
    },
    [clearQueue, run],
  );

  const submit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = input.trim();
      if (!text || !ready) return;
      setInput('');
      setNotice(null);
      if (run.running) {
        enqueue(text);
        return;
      }
      void dispatch(text);
    },
    [dispatch, enqueue, input, ready, run],
  );

  const newChat = useCallback(() => {
    run.reset();
    setInput('');
    clearQueue();
    setNotice(null);
    inputRef.current?.focus();
  }, [clearQueue, run]);

  const runTraces = traces.filter((trace) => trace.method === 'tools/call').slice(0, 40);
  const traceStats = {
    ok: runTraces.filter((t) => t.status === 'ok').length,
    failed: runTraces.filter((t) => t.status === 'error').length,
    total: runTraces.reduce((sum, t) => sum + (t.durationMs ?? 0), 0),
    slowest: runTraces.reduce((max, t) => Math.max(max, t.durationMs ?? 0), 0),
  };
  const visibleTraces =
    traceFilter === 'failed' ? runTraces.filter((t) => t.status === 'error') : runTraces;
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
      <header className="app-header shrink-0 flex items-center gap-3 pl-3 pr-3 h-16 border-b border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-900/30">
        <button
          type="button"
          onClick={onClose}
          title="Back to servers"
          aria-label="Back to servers"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden>
            <path
              d="M10 3.5 5.5 8l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="h-5 w-px bg-zinc-800" aria-hidden />

        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg border border-violet-800/50 bg-violet-950/40 text-violet-300">
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden>
              <path
                d="M2.5 3.5h11v7h-6l-3.5 2.5v-2.5h-1.5z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-sm font-medium text-zinc-100">Agent Chat</span>
            {/*
              A status line rather than a bare tool count: whether the chat can
              run at all is the thing a reader needs first, and it was previously
              only discoverable by finding the composer disabled.
            */}
            <span className="flex items-center gap-1.5 text-[11px] min-w-0">
              <span
                className={[
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  ready ? 'bg-emerald-400' : 'bg-amber-400',
                ].join(' ')}
                aria-hidden
              />
              <span className={`truncate ${ready ? 'text-zinc-500' : 'text-amber-500/80'}`}>
                {ready
                  ? `${run.toolCount} tool${run.toolCount === 1 ? '' : 's'} exposed`
                  : connectedIds.length === 0
                    ? 'No connected MCP server'
                    : !config
                      ? 'No model selected'
                      : 'No server in scope'}
              </span>
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 min-w-0">
          {/* Only once there is something to clear — an empty chat has no
              "new" to offer, and the header is already crowded. */}
          {hasConversation && (
            <button
              type="button"
              data-testid="agent-new-chat"
              onClick={newChat}
              title="Start a new conversation"
              className="shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-zinc-800 text-zinc-400 hover:text-violet-300 hover:border-violet-800/70 hover:bg-violet-950/30 transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
                <path
                  d="M8 3.5v9M3.5 8h9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              New chat
            </button>
          )}
          <AgentModelPicker
            configs={llmConfigs}
            activeConfigId={effectiveConfigId}
            servers={servers}
            selectedServerIds={selectedServerIds}
            onSelectConfig={setActiveConfigId}
            onSaveConfig={(next) => {
              // Replace in place. Appending moved an edited server to the end,
              // which silently changed which one `llmConfigs[0]` makes default.
              const exists = llmConfigs.some((c) => c.id === next.id);
              onSaveLlmConfigs(
                exists
                  ? llmConfigs.map((c) => (c.id === next.id ? next : c))
                  : [...llmConfigs, next],
              );
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

      {notice && (
        <div
          data-testid="agent-notice"
          role="status"
          className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2"
        >
          <p className="rounded-full border border-violet-800/60 bg-violet-950/90 px-3.5 py-1.5 text-[11px] text-violet-200 shadow-lg backdrop-blur">
            {notice}
          </p>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <section className="flex-1 flex flex-col min-w-0">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const next = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              atBottomRef.current = next;
              // Only on the flip. A setState per scroll event would re-render
              // the whole transcript on every frame of a drag.
              setAtBottom((current) => (current === next ? current : next));
            }}
            className="flex-1 overflow-y-auto flex flex-col"
          >
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
                  /* An open approval card is the user's turn, not the agent's. */
                  busy={run.running && !run.pending}
                  onRecordObservation={recordObservation}
                />
              ) : (
                run.collisions.length === 0 && (
                  <div className="flex-1 min-h-0">
                    <EmptyState
                      toolCount={run.toolCount}
                      ready={ready}
                      hasConnectedServer={connectedIds.length > 0}
                      onClose={onClose}
                    />
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
                <div
                  data-testid="agent-error"
                  className="flex items-start gap-3 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2"
                >
                  <p className="flex-1 min-w-0">{run.error}</p>
                  {/* A failed turn otherwise means retyping the prompt: the
                      history is still intact, so it can just be re-sent. */}
                  <button
                    type="button"
                    data-testid="agent-retry"
                    onClick={() => void run.retry()}
                    disabled={!ready || run.running || run.messages.length === 0}
                    className="shrink-0 text-[11px] px-2 py-1 rounded-md border border-red-900/60 text-red-200 hover:bg-red-900/40 hover:text-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="relative shrink-0 border-t border-zinc-800 bg-zinc-900/30 py-4">
            {/* Scrolled up, the conversation keeps growing out of sight; this is
                the way back. */}
            {!atBottom && (
              <div className="absolute -top-5 inset-x-0 flex justify-center pointer-events-none">
                <button
                  type="button"
                  data-testid="agent-jump-to-latest"
                  onClick={jumpToLatest}
                  className="pointer-events-auto inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-lg hover:text-zinc-100 hover:border-violet-700 transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
                    <path
                      d="M8 3.5v9M4.5 9 8 12.5 11.5 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Jump to latest
                </button>
              </div>
            )}

            <form onSubmit={submit} className={COLUMN}>
              {queued && (
                <div
                  data-testid="agent-queued"
                  className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5"
                >
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-violet-400">
                    Queued
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{queued}</span>
                  <button
                    type="button"
                    data-testid="agent-cancel-queued"
                    onClick={clearQueue}
                    aria-label="Cancel queued message"
                    title="Cancel queued message"
                    className="shrink-0 flex items-center justify-center w-5 h-5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                  >
                    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
                      <path
                        d="m4.5 4.5 7 7m0-7-7 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1.5 focus-within:border-violet-600 transition-colors">
                <textarea
                  ref={inputRef}
                  data-testid="agent-input"
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // An IME uses Enter to commit the candidate it is showing;
                    // sending there would cut the word being typed in half.
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  disabled={!ready}
                  placeholder={
                    !config
                      ? 'Add a model to start'
                      : connectedIds.length === 0
                        ? 'Connect an MCP server first'
                        : !ready
                          ? 'Select a connected server'
                          : 'Ask something…'
                  }
                  className="flex-1 min-w-0 resize-none overflow-y-auto bg-transparent px-2 py-1 text-sm leading-5 text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:cursor-not-allowed"
                  /*
                   * index.css gives every focused input a violet ring. Here the
                   * wrapper already draws it, so the input's own ring would nest
                   * one rectangle inside another. That rule is un-layered, which
                   * beats any Tailwind utility, so an inline style is the
                   * override that actually wins.
                   *
                   * The cap is the point where a long message stops pushing the
                   * transcript off screen and scrolls inside the composer
                   * instead; the effect above sets `height` under it.
                   */
                  style={{ boxShadow: 'none', maxHeight: 'min(40vh, 10.5rem)' }}
                />
                {run.running ? (
                  <>
                    {/* Enter queues; without this there is no pointer route to
                        the same thing, since Send is not on screen mid-run. */}
                    {input.trim().length > 0 && (
                      <button
                        type="submit"
                        data-testid="agent-queue"
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-violet-800/70 text-violet-300 hover:bg-violet-950/40 transition-colors"
                      >
                        Queue
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={run.stop}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
                    >
                      Stop
                    </button>
                  </>
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

        <aside className="w-80 shrink-0 flex flex-col min-h-0 border-l border-zinc-800/80 bg-zinc-900/40">
          <div className="shrink-0 px-3 h-16 border-b border-zinc-800/80 flex items-center gap-2">
            <span className="text-[11px] font-medium text-zinc-300">Live trace</span>
            <span
              className={[
                'text-[10px] tabular-nums px-1.5 py-0.5 rounded-full border',
                runTraces.length > 0
                  ? 'text-violet-300 border-violet-800/60 bg-violet-950/40'
                  : 'text-zinc-600 border-zinc-800 bg-zinc-900',
              ].join(' ')}
            >
              {runTraces.length}
            </span>
            <button
              type="button"
              data-testid="capture-replay-suite"
              onClick={capture}
              disabled={runTraces.length === 0}
              title="Save this run's tool calls as a replay suite"
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-zinc-800 text-zinc-400 hover:text-violet-300 hover:border-violet-800/70 hover:bg-violet-950/30 disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800 disabled:hover:bg-transparent transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
                <path
                  d="M3 3.5h10v9H3zM5.5 3.5v3h5v-3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              Capture
            </button>
          </div>

          {/*
            A summary strip, because the question a trace panel is usually asked
            is "did anything fail and where did the time go" — which a flat list
            of rows makes you compute yourself.
          */}
          {runTraces.length > 0 && (
            <div className="shrink-0 px-3 py-2 border-b border-zinc-800/60 flex items-center gap-2 text-[10px]">
              <span className="text-zinc-500 tabular-nums">
                {traceStats.ok} ok
              </span>
              {traceStats.failed > 0 && (
                <span className="text-red-400 tabular-nums">{traceStats.failed} failed</span>
              )}
              <span className="ml-auto text-zinc-600 tabular-nums">
                {formatDuration(traceStats.total)} total
              </span>
            </div>
          )}

          {traceStats.failed > 0 && (
            <div className="shrink-0 px-2 py-1.5 border-b border-zinc-800/60 flex items-center gap-1">
              {(['all', 'failed'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTraceFilter(mode)}
                  className={[
                    'text-[10px] px-2 py-0.5 rounded-md border transition-colors',
                    traceFilter === mode
                      ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {mode === 'all' ? 'All' : 'Failed'}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2">
            {runTraces.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
                <div className="w-8 h-8 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-zinc-700" aria-hidden>
                    <path
                      d="M2 8h3l2-4 2 8 2-4h3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-[11px] text-zinc-500">No tool calls yet</p>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Every call the model makes appears here as it happens, and in the Protocol
                  Inspector.
                </p>
              </div>
            ) : (
              <ol className="relative">
                {/* The connector reads the rows as one sequence rather than a
                    pile of unrelated cards. */}
                <span
                  className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-800"
                  aria-hidden
                />
                {visibleTraces.map((trace) => {
                  const duration = typeof trace.durationMs === 'number' ? trace.durationMs : null;
                  const share =
                    duration !== null && traceStats.slowest > 0
                      ? Math.max(2, Math.round((duration / traceStats.slowest) * 100))
                      : 0;
                  const failed = trace.status === 'error';
                  return (
                    <li
                      key={trace.id}
                      data-testid="trace-row"
                      className="group relative pl-6 pr-1 py-1.5 rounded-lg hover:bg-zinc-900/70 transition-colors"
                    >
                      <span
                        className={[
                          'absolute left-1 top-[13px] w-3 h-3 rounded-full border-2 border-zinc-900',
                          failed
                            ? 'bg-red-400'
                            : trace.status === 'ok'
                              ? 'bg-emerald-400'
                              : 'bg-amber-400 animate-pulse',
                        ].join(' ')}
                        aria-hidden
                      />
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`font-mono text-[11px] truncate ${failed ? 'text-red-300' : 'text-zinc-300'}`}
                        >
                          {toolNameOf(trace) ?? trace.method}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-zinc-600 tabular-nums">
                          {duration !== null ? formatDuration(duration) : '…'}
                        </span>
                      </div>
                      {/* Relative to the slowest call in the run, so the outlier
                          is visible without reading every number. */}
                      {share > 0 && (
                        <div className="mt-1 h-0.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${failed ? 'bg-red-500/60' : 'bg-violet-500/50'}`}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
