import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AgentMessage, AgentToolCall } from '../lib/agent/types';
import { MarkdownPreview } from './MarkdownPreview';

interface Props {
  messages: AgentMessage[];
  /** Text arriving from the model right now, not yet a finished message. */
  streamingText: string;
  /**
   * The run is live: the model is generating, or a tool it asked for is
   * executing. False while the run waits on the approval gate — that is the
   * user's turn, not the agent's.
   */
  busy: boolean;
  onRecordObservation: (toolName: string, note: string) => void;
}

/** The `Record` button's weight, shared by every control in the transcript. */
const QUIET_BUTTON =
  'shrink-0 rounded-md px-2 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-800/70 hover:text-violet-300';

/**
 * Out of the way until its block is hovered — but `focus-visible` keeps it
 * reachable, because a control only a mouse can find is not a control.
 *
 * No `transition-opacity`: it would fight `transition-colors` on the shared
 * button class for the same `transition-property`, and one of the two would
 * silently lose depending on stylesheet order.
 */
const HOVER_REVEAL = 'opacity-0 group-hover/block:opacity-100 focus-visible:opacity-100';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Raw text out of the app and into a bug report, which is most of why anyone
 * runs a tool here in the first place.
 *
 * `navigator.clipboard` is undefined over plain HTTP and `writeText` rejects
 * when the permission is denied, so the failure is reported on the button: a
 * copy control that quietly does nothing is worse than no button at all.
 */
function CopyButton({ text, label, testId }: { text: string; label: string; testId: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const revert = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Closing the panel unmounts the transcript, which happens well inside the
  // revert window often enough to matter.
  useEffect(
    () => () => {
      if (revert.current !== null) clearTimeout(revert.current);
    },
    [],
  );

  async function copy() {
    if (revert.current !== null) clearTimeout(revert.current);
    let next: CopyState = 'copied';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = 'failed';
    }
    setState(next);
    revert.current = setTimeout(() => setState('idle'), 2000);
  }

  const caption = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy';

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => void copy()}
      aria-label={state === 'idle' ? label : `${label} — ${caption.toLowerCase()}`}
      title={label}
      className={[
        QUIET_BUTTON,
        state === 'idle' ? HOVER_REVEAL : 'opacity-100',
        state === 'copied' ? 'text-violet-300' : '',
        state === 'failed' ? 'text-red-400' : '',
      ].join(' ')}
    >
      {caption}
    </button>
  );
}

/**
 * A tool result, capped so one huge payload cannot bury the rest of the
 * transcript, plus the controls for getting at all of it.
 */
function ToolResultBody({ text, className }: { text: string; className: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const body = useRef<HTMLDivElement | null>(null);

  /*
   * Whether the cap bites is a layout fact rather than a property of the text —
   * the same payload fits a wide panel and overflows a narrow one. Measuring it
   * keeps the expander off short results, where it is pure noise.
   */
  useLayoutEffect(() => {
    const el = body.current;
    // While expanded there is nothing left to measure, so the verdict reached
    // while collapsed stands and the control does not vanish under the user.
    if (!el || expanded) return;
    setClipped(el.scrollHeight - el.clientHeight > 1);
  }, [text, expanded]);

  return (
    <div className="group/block space-y-1">
      <div
        ref={body}
        data-testid="tool-result"
        className={[
          'overflow-auto whitespace-pre-wrap',
          expanded ? '' : 'max-h-64',
          className,
        ].join(' ')}
      >
        {text}
      </div>

      <div className="-ml-1 flex items-center gap-1">
        {clipped && (
          <button
            type="button"
            data-testid="tool-result-expand"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className={QUIET_BUTTON}
          >
            {expanded ? 'Collapse' : 'Show full result'}
          </button>
        )}
        <CopyButton text={text} label="Copy tool result" testId="tool-result-copy" />
      </div>
    </div>
  );
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
 * Proof the run is still alive when there is nothing else to show.
 *
 * The streaming caret only exists once the first token lands, so the gaps that
 * matter — waiting on the model's first token, a tool executing, the model
 * thinking again after a tool result — used to render as a frozen transcript.
 */
function WorkingIndicator() {
  return (
    <div className="flex gap-3" data-testid="agent-working" role="status" aria-live="polite">
      <Avatar />
      <div className="flex h-6 items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-violet-400/80 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
        <span className="sr-only">Working</span>
      </div>
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
              <ToolResultBody
                text={result.text}
                className={[
                  'rounded-lg p-2 font-mono text-[11px]',
                  failed ? 'bg-red-950/30 text-red-300' : 'bg-zinc-950/70 text-zinc-400',
                ].join(' ')}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentTranscript({ messages, streamingText, busy, onRecordObservation }: Props) {
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
            <div key={index} className="ml-9">
              <ToolResultBody
                text={message.text}
                className={[
                  'rounded-xl border p-2.5 font-mono text-[11px]',
                  message.isError
                    ? 'border-red-900/50 bg-red-950/20 text-red-300'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400',
                ].join(' ')}
              />
            </div>
          );
        }

        return (
          <div key={index} className="flex gap-3">
            <Avatar />
            <div className="min-w-0 flex-1 space-y-2">
              {message.text && (
                <div className="group/block">
                  <div data-testid="assistant-markdown">
                    <MarkdownPreview source={message.text} className="md-preview md-chat" />
                  </div>
                  <div className="-ml-2 flex items-center">
                    {/* The markdown source, not the rendered HTML — what gets
                        pasted into an issue should be the model's own text. */}
                    <CopyButton
                      text={message.text}
                      label="Copy assistant message"
                      testId="assistant-copy"
                    />
                  </div>
                </div>
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
          <div data-testid="streaming-text" className="min-w-0 flex-1">
            {/* Partial markdown renders fine — an unclosed fence simply stays
                plain until its closing token arrives. */}
            <MarkdownPreview source={streamingText} className="md-preview md-chat" />
            <span aria-hidden className="animate-pulse text-violet-400">▌</span>
          </div>
        </div>
      )}

      {busy && !streamingText && <WorkingIndicator />}
    </div>
  );
}
