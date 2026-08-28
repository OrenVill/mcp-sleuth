import { useState } from 'react';
import type { AgentToolCall, DenyReason, GateDecision, GateVerdict } from '../lib/agent/types';

interface Props {
  call: AgentToolCall;
  verdict: GateVerdict;
  serverName: string;
  onDecide: (decision: GateDecision) => void;
}

const DENY_REASONS: { value: DenyReason; label: string; hint: string }[] = [
  { value: 'wrong_tool', label: 'Wrong tool', hint: 'Descriptions do not tell these tools apart' },
  { value: 'bad_arguments', label: 'Bad arguments', hint: 'The schema did not constrain the model' },
  { value: 'unsafe', label: 'Unsafe', hint: 'Not recorded — already covered by Permission Surface' },
  { value: 'no_reason', label: 'Just no', hint: 'Not recorded' },
];

export function ToolCallApproval({ call, verdict, serverName, onDecide }: Props) {
  const [denying, setDenying] = useState(false);

  return (
    <div
      data-testid="tool-call-approval"
      className="border border-violet-800/60 bg-violet-950/20 rounded-lg p-3 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-violet-300">Tool call</span>
        <span className="font-mono text-xs text-zinc-200">{call.toolName}</span>
        <span className="text-[11px] text-zinc-500">{serverName}</span>
        {verdict === 'ask_locked' && (
          <span
            data-testid="risk-locked-badge"
            title="This tool can never be added to the session allowlist."
            className="ml-auto text-[10px] uppercase tracking-wide text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5"
          >
            Always asks
          </span>
        )}
      </div>

      <pre className="bg-zinc-900 border border-zinc-800 rounded-md p-2 text-[11px] text-zinc-300 overflow-x-auto">
        {JSON.stringify(call.args, null, 2)}
      </pre>

      {denying ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-zinc-400">Why are you denying this?</p>
          <div className="flex flex-wrap gap-1.5">
            {DENY_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                title={reason.hint}
                onClick={() => onDecide({ kind: 'deny', reason: reason.value })}
                className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-red-600 hover:text-red-300 transition-colors"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onDecide({ kind: 'allow', remember: false })}
            className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            Allow
          </button>
          {verdict !== 'ask_locked' && (
            <button
              type="button"
              onClick={() => onDecide({ kind: 'allow', remember: true })}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-violet-600 transition-colors"
            >
              Always allow this tool
            </button>
          )}
          <button
            type="button"
            onClick={() => setDenying(true)}
            className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:border-red-600 hover:text-red-300 transition-colors"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
