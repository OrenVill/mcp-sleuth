import { getProvider } from '../../agent/providers';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import type { LlmHost } from '../types';

type Envelope<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

export interface LlmBridge {
  llmChatStart(payload: {
    requestId: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
  }): Promise<Envelope<boolean>>;
  llmChatAbort(requestId: string): Promise<Envelope<boolean>>;
  llmListModels(payload: {
    url: string;
    headers: Record<string, string>;
  }): Promise<Envelope<unknown>>;
  onLlmChunk(handler: (p: { requestId: string; chunk: string }) => void): () => void;
  onLlmDone(handler: (p: { requestId: string }) => void): () => void;
  onLlmError(handler: (p: { requestId: string; message: string }) => void): () => void;
}

let counter = 0;
function nextRequestId(): string {
  counter += 1;
  return `llm-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

function unwrap<T>(envelope: Envelope<T>): T {
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.value;
}

/**
 * Main streams raw provider bytes back on a push channel keyed by request id;
 * parsing stays here so both hosts share one adapter. The queue exists because
 * chunks arrive from an event callback while the consumer awaits a generator.
 */
export function createLlmElectron(bridge: LlmBridge): LlmHost {
  return {
    async *chat(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
      const provider = getProvider(req.config.provider);
      const { url, headers, body } = provider.buildRequest(req);
      const requestId = nextRequestId();
      const parser = provider.createStreamParser();

      const queue: LlmStreamEvent[] = [];
      let finished = false;
      let failure: Error | null = null;
      let wake: (() => void) | null = null;
      const bump = () => {
        wake?.();
        wake = null;
      };

      const offChunk = bridge.onLlmChunk((payload) => {
        if (payload.requestId !== requestId) return;
        queue.push(...parser.push(payload.chunk));
        bump();
      });
      const offDone = bridge.onLlmDone((payload) => {
        if (payload.requestId !== requestId) return;
        queue.push(...parser.end());
        finished = true;
        bump();
      });
      const offError = bridge.onLlmError((payload) => {
        if (payload.requestId !== requestId) return;
        failure = new Error(payload.message);
        finished = true;
        bump();
      });

      const onAbort = () => {
        void bridge.llmChatAbort(requestId);
      };
      signal.addEventListener('abort', onAbort);

      try {
        unwrap(await bridge.llmChatStart({ requestId, url, headers, body }));
        for (;;) {
          while (queue.length > 0) yield queue.shift() as LlmStreamEvent;
          if (failure) throw failure;
          if (finished) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
        offChunk();
        offDone();
        offError();
      }
    },

    async listModels(config: LlmConfig): Promise<string[]> {
      const provider = getProvider(config.provider);
      const { url, headers } = provider.modelsRequest(config);
      const payload = unwrap(await bridge.llmListModels({ url, headers }));
      return provider.parseModels(payload);
    },
  };
}
