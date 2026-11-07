import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiscoveredTool, ServerEntry } from '../types';
import { getHost } from '../lib/host';
import { callTool } from '../lib/mcpClient';
import { getProtocolTraces } from '../lib/protocolTrace';
import { auditPermissionSurface, type ToolPermissionProfile } from '../lib/permissionSurfaceAudit';
import { buildReplayCaseFromTrace, type ReplayCase } from '../lib/replaySuites';
import { addSessionSuite } from '../lib/replaySuiteSession';
import { gateVerdict, rememberAllowed } from '../lib/agent/gating';
import { DENIAL_TEXT, runAgentTurn } from '../lib/agent/loop';
import { recordAgentRun } from '../lib/agent/agentRunStore';
import { historyForRetry } from '../lib/agent/retry';
import { buildToolCatalog } from '../lib/agent/toolCatalog';
import {
  discoverToolsFromMetaToolResult,
  isMetaToolCall,
} from '../lib/discovery/chatDiscovery';
import { invokeMaybeDiscovered } from '../lib/discovery/invoke';
import { mergeDiscoveredTools } from '../lib/discovery/mergeDiscovered';
import { getAllTools } from '../lib/serverTools';
import {
  DEFAULT_MAX_TURNS,
  type AgentEvent,
  type AgentMessage,
  type AgentToolCall,
  type GateDecision,
  type GateVerdict,
  type LlmConfig,
} from '../lib/agent/types';

const SYSTEM_PROMPT = [
  'You are connected to one or more MCP servers through MCP Detective, a tool for investigating them.',
  'Use the provided tools to answer the user. Prefer a tool over guessing.',
  'The user reviews and may refuse any tool call. If a call is refused, read the reason and adapt',
  'rather than retrying the same call unchanged.',
].join(' ');

export interface PendingCall {
  call: AgentToolCall;
  verdict: GateVerdict;
  serverName: string;
}

function profileKey(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

export function useAgentRun(
  servers: ServerEntry[],
  config: LlmConfig | null,
  selectedServerIds: string[],
  maxTurns: number = DEFAULT_MAX_TURNS,
  onDiscovered?: (serverId: string, tools: DiscoveredTool[]) => void,
  /** Restored from disk when the chat slot mounts (parent should key per slot). */
  initialMessages?: AgentMessage[],
  onMessagesChange?: (messages: AgentMessage[]) => void,
) {
  const [messages, setMessages] = useState<AgentMessage[]>(() => initialMessages ?? []);
  const [streamingText, setStreamingText] = useState('');
  const [pending, setPending] = useState<PendingCall | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<AgentMessage[]>(initialMessages ?? []);

  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  const decideRef = useRef<((decision: GateDecision) => void) | null>(null);
  const allowedRef = useRef<ReadonlySet<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const preRunTraceIds = useRef<Set<string>>(new Set());
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const onDiscoveredRef = useRef(onDiscovered);
  onDiscoveredRef.current = onDiscovered;
  /** Merged into the catalog until App state catches up after a meta-tool call. */
  const pendingDiscoveredRef = useRef<Map<string, DiscoveredTool[]>>(new Map());

  /** Bumps when chat discovery adds tools so the header count re-renders. */
  const [discoveryTick, setDiscoveryTick] = useState(0);

  const catalog = useMemo(() => {
    const withPending = servers.map((s) => {
      const pending = pendingDiscoveredRef.current.get(s.id);
      if (!pending?.length) return s;
      return { ...s, discovered: mergeDiscoveredTools(s.discovered, pending) };
    });
    return buildToolCatalog(withPending, selectedServerIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- discoveryTick forces refresh after meta-tool calls
  }, [servers, selectedServerIds, discoveryTick]);

  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    for (const server of servers) {
      const pending = pendingDiscoveredRef.current.get(server.id);
      if (!pending?.length) continue;
      const known = new Set((server.discovered ?? []).map((t) => t.name));
      if (pending.every((t) => known.has(t.name))) {
        pendingDiscoveredRef.current.delete(server.id);
      }
    }
  }, [servers]);

  const serversForCatalog = useCallback((): ServerEntry[] => {
    return serversRef.current.map((s) => {
      const pending = pendingDiscoveredRef.current.get(s.id);
      if (!pending?.length) return s;
      return { ...s, discovered: mergeDiscoveredTools(s.discovered, pending) };
    });
  }, []);

  const liveCatalog = useCallback(
    () => buildToolCatalog(serversForCatalog(), selectedServerIds),
    [selectedServerIds, serversForCatalog],
  );

  const profiles = useMemo(() => {
    const map = new Map<string, ToolPermissionProfile>();
    for (const surface of auditPermissionSurface(servers).servers) {
      for (const profile of surface.tools) {
        map.set(profileKey(surface.serverId, profile.toolName), profile);
      }
    }
    return map;
  }, [servers]);

  const serverName = useCallback(
    (serverId: string) => servers.find((s) => s.id === serverId)?.name ?? serverId,
    [servers],
  );

  const commit = useCallback((next: AgentMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    onMessagesChangeRef.current?.(next);
  }, []);

  const decide = useCallback((decision: GateDecision) => {
    const resolve = decideRef.current;
    decideRef.current = null;
    setPending(null);
    resolve?.(decision);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // A pending gate would otherwise hold the loop open forever.
    if (decideRef.current) decide({ kind: 'deny', reason: 'no_reason' });
  }, [decide]);

  const reset = useCallback(() => {
    stop();
    commit([]);
    setStreamingText('');
    setError(null);
    allowedRef.current = new Set();
    pendingDiscoveredRef.current.clear();
  }, [commit, stop]);

  const agentCallTool = useCallback(
    async (serverId: string, toolName: string, args: Record<string, unknown>) => {
      const server = serversRef.current.find((s) => s.id === serverId);
      if (!server) throw new Error(`Unknown server ${serverId}`);
      const metaTools = server.metaTools ?? [];
      const tool =
        getAllTools(server).find((t) => t.name === toolName) ??
        ({ name: toolName, inputSchema: { type: 'object' } } as const);

      const result = await invokeMaybeDiscovered({
        callTool: (name, innerArgs) => callTool(serverId, name, innerArgs),
        tool,
        args,
        metaTools,
      });

      if (
        onDiscoveredRef.current &&
        isMetaToolCall(metaTools, toolName) &&
        result.isError !== true
      ) {
        const meta = metaTools.find((m) => m.toolName === toolName);
        if (meta) {
          const discovered = discoverToolsFromMetaToolResult(meta, result);
          if (discovered.length > 0) {
            pendingDiscoveredRef.current.set(
              serverId,
              mergeDiscoveredTools(pendingDiscoveredRef.current.get(serverId), discovered),
            );
            onDiscoveredRef.current?.(serverId, discovered);
            setDiscoveryTick((n) => n + 1);
          }
        }
      }

      return result;
    },
    [],
  );

  /**
   * One turn against the given history. Shared by `send` and `retry` so a retry
   * is genuinely the same run, not a second implementation of it: the history is
   * the only thing that differs, and the caller has already committed it.
   */
  const runFrom = useCallback(
    async (activeConfig: LlmConfig, history: AgentMessage[]) => {
      setError(null);
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;
      preRunTraceIds.current = new Set(getProtocolTraces().map((trace) => trace.id));

      const events: AgentEvent[] = [];
      let streamed = '';
      let live = history;

      const append = (message: AgentMessage) => {
        live = [...live, message];
        commit(live);
      };

      try {
        const generator = runAgentTurn(
          {
            sendToModel: (req, signal) => getHost().llm.chat(req, signal),
            callTool: agentCallTool,
            gate: (call) => {
              const verdict = gateVerdict(
                call,
                profiles.get(profileKey(call.serverId, call.toolName)),
                allowedRef.current,
              );
              if (verdict === 'auto') {
                return Promise.resolve<GateDecision>({ kind: 'allow', remember: false });
              }
              return new Promise<GateDecision>((resolve) => {
                decideRef.current = (decision) => {
                  if (decision.kind === 'allow' && decision.remember) {
                    allowedRef.current = rememberAllowed(allowedRef.current, call);
                  }
                  resolve(decision);
                };
                setPending({ call, verdict, serverName: serverName(call.serverId) });
              });
            },
            resolve: (name) => liveCatalog().resolve(name),
            getTools: () => liveCatalog().tools,
            maxTurns,
            signal: controller.signal,
          },
          { config: activeConfig, system: SYSTEM_PROMPT, tools: catalogRef.current.tools, messages: history },
        );

        for (;;) {
          const next = await generator.next();
          if (next.done) {
            commit(next.value);
            break;
          }
          const event = next.value;
          events.push(event);

          if (event.type === 'model_delta') {
            streamed += event.text;
            setStreamingText(streamed);
          } else if (event.type === 'model_message') {
            streamed = '';
            setStreamingText('');
            append(event.message);
          } else if (event.type === 'tool_result') {
            append({
              role: 'tool',
              text: event.text,
              toolCallId: event.call.id,
              isError: event.isError,
            });
          } else if (event.type === 'tool_denied') {
            append({
              role: 'tool',
              text: DENIAL_TEXT[event.reason],
              toolCallId: event.call.id,
              isError: true,
            });
          } else if (event.type === 'error') {
            setError(event.message);
          } else if (event.type === 'turn_limit') {
            setError(`Stopped after ${event.turns} turns.`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStreamingText('');
        setRunning(false);
        abortRef.current = null;
        decideRef.current = null;
        setPending(null);
        // Only derived counters are stored; the transcript is never persisted.
        if (selectedServerIds[0]) recordAgentRun(selectedServerIds[0], events);
      }
    },
    [agentCallTool, commit, liveCatalog, maxTurns, profiles, selectedServerIds, serverName],
  );

  const send = useCallback(
    async (text: string) => {
      if (!config || running || selectedServerIds.length === 0) return;
      const history: AgentMessage[] = [...messagesRef.current, { role: 'user', text }];
      commit(history);
      await runFrom(config, history);
    },
    [commit, config, running, runFrom, selectedServerIds],
  );

  /**
   * Re-run the last turn from the history as it stands. Nothing is appended: the
   * user's message is already in there, and a failed turn left no assistant
   * reply behind, so re-sending the same history is the whole of a retry.
   *
   * The pruning matters after a Stop, which can leave a tool call with no
   * result. The pruned history is committed before the run so the transcript
   * shows what was actually re-sent — `runFrom` would drop those messages at
   * its first append anyway, and a transcript that disagrees with what the
   * model received is the one thing this whole surface exists to avoid.
   */
  const retry = useCallback(async () => {
    if (!config || running || selectedServerIds.length === 0) return;
    const history = historyForRetry(messagesRef.current);
    if (history.length === 0) return;
    commit(history);
    await runFrom(config, history);
  }, [commit, config, running, runFrom, selectedServerIds]);

  /**
   * Turn this run's tool calls into a replay suite. The calls are already
   * protocol traces, so the existing trace-to-case converter does the work.
   * Traces are matched by id rather than by time, so ordering in the store
   * does not matter.
   */
  const captureAsSuite = useCallback(
    (name: string): number => {
      const cases = getProtocolTraces()
        .filter((trace) => !preRunTraceIds.current.has(trace.id))
        .map((trace) => buildReplayCaseFromTrace(trace, serverName(trace.serverId)))
        .filter((entry): entry is ReplayCase => entry !== null);
      if (cases.length === 0) return 0;
      addSessionSuite({
        id: `suite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        createdAt: Date.now(),
        cases,
      });
      return cases.length;
    },
    [serverName],
  );

  return {
    messages,
    streamingText,
    pending,
    running,
    error,
    collisions: catalog.collisions,
    toolCount: catalog.tools.length,
    send,
    retry,
    decide,
    stop,
    reset,
    captureAsSuite,
  };
}
