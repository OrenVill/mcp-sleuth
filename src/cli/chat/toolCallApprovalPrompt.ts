import * as clack from '@clack/prompts';
import type { AgentToolCall, DenyReason, GateDecision, GateVerdict } from '../../lib/agent/types';
import { boxRow, formatToolArgsDisplayLines } from './formatToolArgsDisplay';
import { colorizeToolApprovalCard } from './terminalTheme';

const DENY_REASONS: { value: DenyReason; label: string; hint: string }[] = [
  { value: 'wrong_tool', label: 'Wrong tool', hint: 'Descriptions do not tell these tools apart' },
  { value: 'bad_arguments', label: 'Bad arguments', hint: 'Schema did not constrain the model' },
  { value: 'unsafe', label: 'Unsafe', hint: 'Not recorded — see Permission Surface' },
  { value: 'no_reason', label: 'Just no', hint: 'Not recorded' },
];

function clampWidth(preferred: number): number {
  const cols = process.stdout.columns ?? preferred;
  return Math.max(44, Math.min(preferred, cols - 2));
}

/** Plain card shown before the approval prompt (testable, no I/O). */
export function formatToolCallApprovalCard(options: {
  call: AgentToolCall;
  serverName: string;
  verdict: GateVerdict;
  width?: number;
}): string {
  const { call, serverName, verdict } = options;
  const width = clampWidth(options.width ?? 68);
  const rule = '─'.repeat(width - 2);
  const innerWidth = width - 4;

  const lines: string[] = [`╭${rule}╮`, boxRow(`Tool call  ${call.toolName}  ·  ${serverName}`, width)];

  if (verdict === 'ask_locked') {
    lines.push(boxRow('ALWAYS ASKS — high risk in Permission Surface', width));
  }

  lines.push(`├${rule}┤`);

  const argLines = formatToolArgsDisplayLines(call.args, { innerWidth, maxLines: 28 });
  for (const line of argLines) {
    lines.push(boxRow(line, width));
  }

  lines.push(`╰${rule}╯`);
  return lines.join('\n');
}

export async function promptToolCallApproval(options: {
  call: AgentToolCall;
  serverName: string;
  verdict: GateVerdict;
}): Promise<GateDecision> {
  process.stdout.write(`\n${colorizeToolApprovalCard(formatToolCallApprovalCard(options))}\n\n`);

  const actions: { value: 'allow' | 'remember' | 'deny'; label: string }[] = [
    { value: 'allow', label: 'Allow once' },
  ];
  if (options.verdict !== 'ask_locked') {
    actions.push({ value: 'remember', label: 'Always allow this tool (session)' });
  }
  actions.push({ value: 'deny', label: 'Deny…' });

  const action = await clack.select({
    message: 'Approve tool call?',
    options: actions,
    initialValue: 'deny',
  });

  if (clack.isCancel(action) || action === 'deny') {
    const reason = await clack.select({
      message: 'Why deny?',
      options: DENY_REASONS.map((r) => ({
        value: r.value,
        label: r.hint ? `${r.label} — ${r.hint}` : r.label,
      })),
    });
    if (clack.isCancel(reason)) {
      return { kind: 'deny', reason: 'no_reason' };
    }
    return { kind: 'deny', reason: reason as DenyReason };
  }

  if (action === 'remember') {
    return { kind: 'allow', remember: true };
  }
  return { kind: 'allow', remember: false };
}
