import type { AgentMessage, AgentToolCall } from '../lib/agent/types';

interface Props {
  messages: AgentMessage[];
  /** Text arriving from the model right now, not yet a finished message. */
  streamingText: string;
  onRecordObservation: (toolName: string, note: string) => void;
}

function ToolCallRow({
  call,
  onRecord,
}: {
  call: AgentToolCall;
  onRecord: (toolName: string, note: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-violet-400 font-mono">{call.toolName}</span>
      <span className="min-w-0 text-zinc-600 font-mono truncate">{JSON.stringify(call.args)}</span>
      <button
        type="button"
        onClick={() => onRecord(call.toolName, `Agent called ${call.toolName}`)}
        className="ml-auto shrink-0 text-zinc-600 hover:text-violet-400 transition-colors"
        title="Record this in the Observation Journal"
      >
        Record
      </button>
    </div>
  );
}

export function AgentTranscript({ messages, streamingText, onRecordObservation }: Props) {
  return (
    <div data-testid="agent-transcript" className="space-y-3">
      {messages.map((message, index) => {
        if (message.role === 'user') {
          return (
            <div key={index} className="text-sm text-zinc-200">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500 mr-2">You</span>
              {message.text}
            </div>
          );
        }

        if (message.role === 'tool') {
          return (
            <div
              key={index}
              data-testid="tool-result"
              className={[
                'border rounded-md p-2 text-[11px] font-mono whitespace-pre-wrap',
                message.isError
                  ? 'border-red-900/60 bg-red-950/20 text-red-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400',
              ].join(' ')}
            >
              {message.text}
            </div>
          );
        }

        return (
          <div key={index} className="space-y-1.5">
            {message.text && <div className="text-sm text-zinc-300">{message.text}</div>}
            {message.toolCalls?.map((call) => (
              <ToolCallRow key={call.id} call={call} onRecord={onRecordObservation} />
            ))}
          </div>
        );
      })}

      {streamingText && (
        <div data-testid="streaming-text" className="text-sm text-zinc-300">
          {streamingText}
        </div>
      )}
    </div>
  );
}
