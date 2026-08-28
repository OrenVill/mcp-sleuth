import { useEffect, useId, useRef, useState } from 'react';
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

/* Buttons distinguish pointer from keyboard, so they get :focus-visible. The two
   containers below cannot: they are focused from an effect, which no browser
   counts as a keyboard interaction, so a focus-visible ring there would never
   paint. They use plain :focus. */
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2';
const ACTION = `text-xs px-2.5 py-1 rounded-md transition-colors ${FOCUS_RING}`;

export function ToolCallApproval({ call, verdict, serverName, onDecide }: Props) {
  const [denying, setDenying] = useState(false);
  const [shownCallId, setShownCallId] = useState(call.id);
  const cardRef = useRef<HTMLDivElement>(null);
  const reasonsRef = useRef<HTMLDivElement>(null);
  const argsId = useId();

  /*
   * Focus the card itself, never the Allow button. The card can arrive while the
   * user is still typing in the composer, and a focused Allow would turn a stray
   * Enter into an approved tool call. Reaching Allow must cost one deliberate
   * Tab — this is a security gate, and the deliberateness is the feature.
   *
   * preventScroll, then scrollIntoView: focus would scroll the transcript on its
   * own terms and fight the panel's own bottom-follow. 'nearest' moves the least
   * that still guarantees no call is approved off-screen.
   */
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    cardRef.current?.scrollIntoView({ block: 'nearest' });
  }, [call.id]);

  /*
   * Same rule one level down: land on the reason group, not on a reason. Enter
   * held down on Deny repeats onto whatever is focused next, which would record
   * a deny reason the user never chose.
   */
  useEffect(() => {
    if (denying) reasonsRef.current?.focus({ preventScroll: true });
  }, [denying]);

  /* A second call must never inherit the first one's open reason list — a held
     Enter would deny a call the user has not read yet. */
  if (shownCallId !== call.id) {
    setShownCallId(call.id);
    setDenying(false);
  }

  return (
    <div
      data-testid="tool-call-approval"
      ref={cardRef}
      tabIndex={-1}
      role="group"
      aria-label={`Approve tool call ${call.toolName} on ${serverName}`}
      aria-describedby={argsId}
      /*
       * Not alertdialog: that promises modality and an Escape route, and Escape
       * belongs to the panel. assertive because the run is stopped until this is
       * answered — a polite queue would let the user keep typing at a stalled
       * agent. The announcement a keyboard user actually gets comes from the
       * focus move above; the live region only covers a refused focus.
       */
      aria-live="assertive"
      className="border border-violet-800/60 bg-violet-950/20 rounded-lg p-3 space-y-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500/70 focus:border-violet-500"
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

      {/* tabIndex -1 keeps Firefox from making the scroller a tab stop ahead of
          Allow; the args still reach a screen reader through aria-describedby. */}
      <pre
        id={argsId}
        tabIndex={-1}
        className="bg-zinc-900 border border-zinc-800 rounded-md p-2 text-[11px] text-zinc-300 overflow-x-auto focus:outline-none"
      >
        {JSON.stringify(call.args, null, 2)}
      </pre>

      {denying ? (
        <div
          data-testid="deny-reasons"
          ref={reasonsRef}
          tabIndex={-1}
          role="group"
          aria-label="Reason for denying"
          className="space-y-1.5 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500/60"
        >
          <p className="text-[11px] text-zinc-400">Why are you denying this?</p>
          <div className="flex flex-wrap gap-1.5">
            {DENY_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                title={reason.hint}
                onClick={() => onDecide({ kind: 'deny', reason: reason.value })}
                className={`text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-red-600 hover:text-red-300 transition-colors ${FOCUS_RING} focus-visible:ring-red-500/70`}
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
            className={`${ACTION} bg-violet-600 text-white hover:bg-violet-500 focus-visible:ring-violet-400`}
          >
            Allow
          </button>
          {verdict !== 'ask_locked' && (
            <button
              type="button"
              onClick={() => onDecide({ kind: 'allow', remember: true })}
              className={`${ACTION} border border-zinc-700 text-zinc-300 hover:border-violet-600 focus-visible:ring-violet-500/70`}
            >
              Always allow this tool
            </button>
          )}
          <button
            type="button"
            onClick={() => setDenying(true)}
            className={`${ACTION} border border-zinc-700 text-zinc-400 hover:border-red-600 hover:text-red-300 focus-visible:ring-red-500/70`}
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
