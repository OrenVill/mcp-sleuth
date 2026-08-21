import { useState } from 'react';
import type { AgentMessage, AgentToolCall } from '../lib/agent/types';

interface Props {
  messages: AgentMessage[];
  /** Text arriving from the model right now, not yet a finished message. */
  streamingText: string;
  onRecordObservation: (toolName: string, note: string) => void;
}

function Avatar() {
  return (
    <div
      aria-hidden
      className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-violet-800/60 bg-violet-950/40 grid place-items-center"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3 text-violet-400" fill="currentColor">
        <path d="M8 1.5l1.6 3.9L13.5 7l-3.9 1.6L8 12.5 6.4 8.6 2.5 7l3.9-1.6L8 1.5z" />
      </svg>
    </div>
  );
}

/**
 * One tool call and the result it produced, as a single unit.
 *
 * The loop emits these as two separate messages — an assistant turn holding the
 * call, then a `tool` message holding the result. Rendering them as two stacked
 * blocks is what made the transcript read as a log rather than a conversation,
 * so they are paired back up here and shown as one collapsible step.
 */
function ToolStep({
  call,
  result,
  onRecord,
}: {
  call: AgentToolCall;
  result?: AgentMessage;
  onRecord: (toolName: string, note: string) => void;
}) {
  const failed = result?.isError === true;
  const pending = result === undefined;
  /*
   * `null` means the user has not decided, so the step follows the outcome: a
   * failure is the thing worth reading and opens itself, a success stays out of
   * the way. It cannot be a `useState(failed)` initial value — at mount the
   * result has not arrived yet, so that would capture `false` and never reopen.
   */
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? failed;

  return (
    <div
      data-testid="tool-step"
      className={[
        'rounded-xl border overflow-hidden transition-colors',
        failed ? 'border-red-900/50 bg-red-950/20' : 'border-zinc-800 bg-zinc-900/50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setChoice(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className={`h-3 w-3 shrink-0 text-zinc-600 transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <span
            aria-hidden
            className={[
              'h-1.5 w-1.5 shrink-0 rounded-full',
              pending ? 'bg-amber-400 animate-pulse' : failed ? 'bg-red-400' : 'bg-emerald-400',
            ].join(' ')}
          />

          <span className="font-mono text-xs text-zinc-200 truncate">{call.toolName}</span>

          {!open && (
            <span className="min-w-0 truncate font-mono text-[11px] text-zinc-600">
              {JSON.stringify(call.args)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onRecord(call.toolName, `Agent called ${call.toolName}`)}
          title="Record this in the Observation Journal"
          className="shrink-0 rounded-md px-2 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-800/70 hover:text-violet-300"
        >
          Record
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-zinc-800/80 px-3 py-2.5">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-zinc-600">Arguments</p>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950/70 p-2 font-mono text-[11px] text-zinc-300">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>

          {result && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">
                {failed ? 'Error' : 'Result'}
              </p>
              <div
                data-testid="tool-result"
                className={[
                  'max-h-64 overflow-auto whitespace-pre-wrap rounded-lg p-2 font-mono text-[11px]',
                  failed ? 'bg-red-950/30 text-red-300' : 'bg-zinc-950/70 text-zinc-400',
                ].join(' ')}
              >
                {result.text}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentTranscript({ messages, streamingText, onRecordObservation }: Props) {
  // Results are looked up by call id so each step renders as one unit. Any
  // result whose call is missing still renders on its own below.
  const resultsByCallId = new Map<string, AgentMessage>();
  for (const message of messages) {
    if (message.role === 'tool' && message.toolCallId) {
      resultsByCallId.set(message.toolCallId, message);
    }
  }
  const paired = new Set(
    messages
      .flatMap((message) => message.toolCalls ?? [])
      .map((call) => call.id)
      .filter((id) => resultsByCallId.has(id)),
  );

  return (
    <div data-testid="agent-transcript" className="space-y-5">
      {messages.map((message, index) => {
        if (message.role === 'user') {
          return (
            <div key={index} className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl rounded-br-md bg-violet-600 px-3.5 py-2 text-sm text-white shadow-sm">
                {message.text}
              </div>
            </div>
          );
        }

        if (message.role === 'tool') {
          // Already shown inside its ToolStep.
          if (message.toolCallId && paired.has(message.toolCallId)) return null;
          return (
            <div
              key={index}
              data-testid="tool-result"
              className={[
                'ml-9 whitespace-pre-wrap rounded-xl border p-2.5 font-mono text-[11px]',
                message.isError
                  ? 'border-red-900/50 bg-red-950/20 text-red-300'
                  : 'border-zinc-800 bg-zinc-900/50 text-zinc-400',
              ].join(' ')}
            >
              {message.text}
            </div>
          );
        }

        return (
          <div key={index} className="flex gap-3">
            <Avatar />
            <div className="min-w-0 flex-1 space-y-2">
              {message.text && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
                  {message.text}
                </p>
              )}
              {message.toolCalls?.map((call) => (
                <ToolStep
                  key={call.id}
                  call={call}
                  result={resultsByCallId.get(call.id)}
                  onRecord={onRecordObservation}
                />
              ))}
            </div>
          </div>
        );
      })}

      {streamingText && (
        <div className="flex gap-3">
          <Avatar />
          <p
            data-testid="streaming-text"
            className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100"
          >
            {streamingText}
            <span aria-hidden className="ml-0.5 inline-block animate-pulse text-violet-400">
              ▌
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
