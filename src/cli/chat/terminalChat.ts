import * as clack from '@clack/prompts';
import { auditPermissionSurface } from '../../lib/permissionSurfaceAudit';
import { gateVerdict, rememberAllowed } from '../../lib/agent/gating';
import { runAgentTurn } from '../../lib/agent/loop';
import { recordAgentRun } from '../../lib/agent/agentRunStore';
import type {
  AgentEvent,
  AgentMessage,
  AgentToolCall,
  DenyReason,
  GateDecision,
  LlmConfig,
} from '../../lib/agent/types';
import type { ServerEntry } from '../../types';
import { streamChat } from '../core/llmFetch';
import type { ChatMcpDeps } from '../core/multiConnect';

const SYSTEM = [
  'You are connected to MCP servers through MCP Detective.',
  'Use tools to answer; the user approves each call.',
].join(' ');

const DENY_OPTIONS: { value: DenyReason; label: string }[] = [
  { value: 'wrong_tool', label: 'Wrong tool' },
  { value: 'bad_arguments', label: 'Bad arguments' },
  { value: 'unsafe', label: 'Unsafe' },
  { value: 'no_reason', label: 'Just no' },
];

function profileKey(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

export async function runTerminalChat(options: {
  config: LlmConfig;
  deps: ChatMcpDeps;
  servers: ServerEntry[];
}): Promise<void> {
  const { config, deps, servers } = options;
  let allowed = new Set<string>();
  const profiles = new Map<
    string,
    ReturnType<typeof auditPermissionSurface>['servers'][0]['tools'][0]
  >();
  for (const surface of auditPermissionSurface(servers).servers) {
    for (const p of surface.tools) {
      profiles.set(profileKey(surface.serverId, p.toolName), p);
    }
  }

  const messages: AgentMessage[] = [];
  const abort = new AbortController();

  clack.intro('Agent Chat — empty line to exit');

  while (true) {
    const line = await clack.text({ message: 'You' });
    if (clack.isCancel(line) || !String(line).trim()) break;

    messages.push({ role: 'user', text: String(line) });
    const events: AgentEvent[] = [];

    for await (const event of runAgentTurn(
      {
        sendToModel: (req, signal) => streamChat(config, req, signal),
        callTool: (serverId, toolName, args) => deps.callTool(serverId, toolName, args),
        gate: (call: AgentToolCall) => {
          const verdict = gateVerdict(
            call,
            profiles.get(profileKey(call.serverId, call.toolName)),
            allowed,
          );
          if (verdict === 'auto') {
            return Promise.resolve<GateDecision>({ kind: 'allow', remember: false });
          }
          return new Promise<GateDecision>((resolve) => {
            void (async () => {
              if (verdict === 'ask_locked') {
                clack.log.warn('Permission Surface marks this tool as high risk.');
              }
              clack.log.info(`Tool: ${call.toolName} (${call.serverId})`);
              clack.log.message(JSON.stringify(call.args, null, 2));
              const approve = await clack.confirm({
                message: 'Allow this tool call?',
                active: 'Deny',
              });
              if (approve !== true) {
                const reason = await clack.select({
                  message: 'Deny reason',
                  options: DENY_OPTIONS,
                });
                if (clack.isCancel(reason)) {
                  resolve({ kind: 'deny', reason: 'no_reason' });
                  return;
                }
                resolve({ kind: 'deny', reason: reason as DenyReason });
                return;
              }
              const remember = await clack.confirm({ message: 'Always allow this tool this session?' });
              if (remember === true) {
                allowed = rememberAllowed(allowed, call);
              }
              resolve({ kind: 'allow', remember: remember === true });
            })();
          });
        },
        resolve: (llmName) => deps.resolve(llmName),
        getTools: () => deps.getTools(),
        maxTurns: 12,
        signal: abort.signal,
      },
      {
        config,
        system: SYSTEM,
        tools: deps.getTools(),
        messages: [...messages],
      },
    )) {
      events.push(event);
      if (event.type === 'model_delta') {
        process.stdout.write(event.text);
      }
      if (event.type === 'model_message') {
        process.stdout.write('\n');
        messages.push(event.message);
      }
      if (event.type === 'error') {
        clack.log.error(event.message);
      }
    }

    for (const serverId of servers.map((s) => s.id)) {
      try {
        recordAgentRun(serverId, events);
      } catch {
        /* Node CLI has no renderer app-data host; optional persistence via data.gz later */
      }
    }
  }

  await deps.disconnectAll();
  clack.outro('Chat ended');
}
