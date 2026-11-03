import * as clack from '@clack/prompts';
import type { AgentToolCall, DenyReason, GateDecision, GateVerdict } from '../../lib/agent/types';
import { paint } from './terminalTheme';

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

function padLine(inner: string, width: number): string {
  const visible = inner.length;
  if (visible >= width) return inner.slice(0, width);
  return inner + ' '.repeat(width - visible);
}

/** Violet-bordered card shown before the approval prompt (testable, no I/O). */
export function formatToolCallApprovalCard(options: {
  call: AgentToolCall;
  serverName: string;
  verdict: GateVerdict;
  width?: number;
}): string {
  const { call, serverName, verdict } = options;
  const width = clampWidth(options.width ?? 68);
  const inner = width - 2;
  const border = (char: string) => paint('38;5;240m', char);
  const title = paint('38;5;183m', 'Tool call');
  const tool = paint('1;38;5;252m', call.toolName);
  const server = paint('38;5;245m', serverName);
  const header = `${title}  ${tool}  ${paint('38;5;240m', '·')}  ${server}`;

  const lines: string[] = [];
  lines.push(border(`╭${'─'.repeat(width - 2)}╮`));
  lines.push(border('│') + ' ' + padLine(header, inner - 1) + border('│'));

  if (verdict === 'ask_locked') {
    const badge = paint('38;5;220m', 'ALWAYS ASKS') + paint('38;5;245m', ' — high risk in Permission Surface');
    lines.push(border('│') + ' ' + padLine(badge, inner - 1) + border('│'));
  }

  lines.push(border(`├${'─'.repeat(width - 2)}┤`));

  const argsJson = JSON.stringify(call.args, null, 2);
  const argLines = argsJson.split('\n');
  const maxArgLines = 14;
  for (let i = 0; i < Math.min(argLines.length, maxArgLines); i++) {
    const raw = argLines[i];
    const truncated = raw.length > inner - 2 ? `${raw.slice(0, inner - 5)}…` : raw;
    lines.push(
      border('│') + ' ' + padLine(paint('48;5;235;38;5;245m', truncated), inner - 1) + border('│'),
    );
  }
  if (argLines.length > maxArgLines) {
    lines.push(
      border('│') +
        ' ' +
        padLine(paint('2;38;5;240m', `… ${argLines.length - maxArgLines} more lines`), inner - 1) +
        border('│'),
    );
  }

  lines.push(border(`╰${'─'.repeat(width - 2)}╯`));
  return lines.join('\n');
}

export async function promptToolCallApproval(options: {
  call: AgentToolCall;
  serverName: string;
  verdict: GateVerdict;
}): Promise<GateDecision> {
  process.stdout.write(`\n${formatToolCallApprovalCard(options)}\n\n`);

  const actions: { value: 'allow' | 'remember' | 'deny'; label: string }[] = [
    { value: 'allow', label: 'Allow once' },
  ];
  if (options.verdict !== 'ask_locked') {
    actions.push({ value: 'remember', label: 'Always allow this tool (session)' });
  }
  actions.push({ value: 'deny', label: 'Deny…' });

  const action = await clack.select({
    message: paint('38;5;141m', 'Approve tool call?'),
    options: actions,
    initialValue: 'deny',
  });

  if (clack.isCancel(action) || action === 'deny') {
    const reason = await clack.select({
      message: paint('38;5;203m', 'Why deny?'),
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
