import type { LlmConfig, LlmProviderId, LlmRequest, LlmStreamEvent } from '../types';

export interface ProviderHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Incremental parser over the provider's response body. `push` is fed raw text
 * as it arrives and returns whatever complete events that text produced; `end`
 * flushes a final event if the stream closed without an explicit terminator.
 */
export interface LlmStreamParser {
  push(chunk: string): LlmStreamEvent[];
  end(): LlmStreamEvent[];
}

/**
 * One vendor's wire format. An adapter maps our request shape in and the
 * vendor's stream out. It performs no I/O, so it is testable against recorded
 * bytes with no network.
 */
export interface LlmProvider {
  id: LlmProviderId;
  buildRequest(req: LlmRequest): ProviderHttpRequest;
  createStreamParser(): LlmStreamParser;
  modelsRequest(config: LlmConfig): { url: string; headers: Record<string, string> };
  parseModels(payload: unknown): string[];
}
