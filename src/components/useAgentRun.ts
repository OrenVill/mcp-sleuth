import { useCallback, useMemo, useRef, useState } from 'react';
import type { ServerEntry } from '../types';
import { getHost } from '../lib/host';
import { callTool } from '../lib/mcpClient';
import { getProtocolTraces } from '../lib/protocolTrace';
import { auditPermissionSurface, type ToolPermissionProfile } from '../lib/permissionSurfaceAudit';
import { buildReplayCaseFromTrace, type ReplayCase } from '../lib/replaySuites';
import { addSessionSuite } from '../lib/replaySuiteSession';
import { gateVerdict, rememberAllowed } from '../lib/agent/gating';
import { DENIAL_TEXT, runAgentTurn } from '../lib/agent/loop';
import { recordAgentRun } from '../lib/agent/agentRunStore';
import { buildToolCatalog } from '../lib/agent/toolCatalog';
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
  'You are connected to one or more MCP servers through Sleuth, a tool for investigating them.',
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
) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [pending, setPending] = useState<PendingCall | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<AgentMessage[]>([]);
  const decideRef = useRef<((decision: GateDecision) => void) | null>(null);
  const allowedRef = useRef<ReadonlySet<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const preRunTraceIds = useRef<Set<string>>(new Set());

  const catalog = useMemo(
    () => buildToolCatalog(servers, selectedServerIds),
    [servers, selectedServerIds],
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
  }, [commit, stop]);

  const send = useCallback(
    async (text: string) => {
      if (!config || running || selectedServerIds.length === 0) return;

      setError(null);
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;
      preRunTraceIds.current = new Set(getProtocolTraces().map((trace) => trace.id));

      const history: AgentMessage[] = [...messagesRef.current, { role: 'user', text }];
      commit(history);

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
            callTool,
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
            resolve: catalog.resolve,
            maxTurns,
            signal: controller.signal,
          },
          { config, system: SYSTEM_PROMPT, tools: catalog.tools, messages: history },
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
    [catalog, commit, config, maxTurns, profiles, running, selectedServerIds, serverName],
  );

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
    decide,
    stop,
    reset,
    captureAsSuite,
  };
}
