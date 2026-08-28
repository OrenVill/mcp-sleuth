import type { LlmProviderId } from '../types';
import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';
import type { LlmProvider } from './types';

export type { LlmProvider, LlmStreamParser, ProviderHttpRequest } from './types';

const registry = new Map<LlmProviderId, LlmProvider>();

export function registerProvider(provider: LlmProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: LlmProviderId): LlmProvider {
  const provider = registry.get(id);
  if (!provider) throw new Error(`Unsupported LLM provider "${id}"`);
  return provider;
}

/** Providers wired up in this build. */
export function availableProviderIds(): LlmProviderId[] {
  return [...registry.keys()];
}

registerProvider(openaiProvider);
registerProvider(anthropicProvider);
registerProvider(geminiProvider);
