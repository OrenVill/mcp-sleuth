import * as clack from '@clack/prompts';
import { auditPermissionSurface } from '../../lib/permissionSurfaceAudit';
import { gateVerdict, rememberAllowed } from '../../lib/agent/gating';
import { runAgentTurn } from '../../lib/agent/loop';
import { recordAgentRun } from '../../lib/agent/agentRunStore';
import type {
  AgentEvent,
  AgentMessage,
  AgentToolCall,
  GateDecision,
  LlmConfig,
} from '../../lib/agent/types';
import type { ServerEntry } from '../../types';
import { refreshVaultSessionActivity } from '../core/prelude';
import { streamChat } from '../core/llmFetch';
import type { ChatMcpDeps } from '../core/multiConnect';
import { clearChatScreen, writeChatBanner } from './terminalTheme';
import { writeAssistantMarkdown } from './terminalMarkdown';
import { promptToolCallApproval } from './toolCallApprovalPrompt';

const SYSTEM = [
  'You are connected to MCP servers through MCP Detective.',
  'Use tools to answer; the user approves each call.',
].join(' ');

function profileKey(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

/** True when the user wants to leave Agent Chat (case-insensitive). */
export function isChatExitInput(line: string): boolean {
  return /^exit$/i.test(line.trim());
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

  const serverNames = new Map(servers.map((s) => [s.id, s.name]));

  const messages: AgentMessage[] = [];
  const abort = new AbortController();

  clearChatScreen();
  writeChatBanner('Agent Chat', 'Type exit to leave · tool calls require approval');

  while (true) {
    await refreshVaultSessionActivity();

    const line = await clack.text({
      message: 'You',
    });
    if (clack.isCancel(line)) break;
    const text = String(line).trim();
    if (!text) continue;
    if (isChatExitInput(text)) break;

    messages.push({ role: 'user', text });
    const events: AgentEvent[] = [];
    let modelBuffer = '';

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
              const decision = await promptToolCallApproval({
                call,
                serverName: serverNames.get(call.serverId) ?? call.serverId,
                verdict,
              });
              if (decision.kind === 'allow' && decision.remember) {
                allowed = rememberAllowed(allowed, call);
              }
              resolve(decision);
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
        modelBuffer += event.text;
      }
      if (event.type === 'model_message') {
        modelBuffer = event.message.text;
        messages.push(event.message);
        writeAssistantMarkdown(modelBuffer);
        modelBuffer = '';
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
  process.stdout.write('\nChat ended\n');
}
