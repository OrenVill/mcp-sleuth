import { describe, expect, it } from 'vitest';
import type { LlmProviderId } from '../types';
import { availableProviderIds, getProvider } from './index';

/**
 * Every id in the `LlmProviderId` union must have an adapter registered.
 *
 * The union is what the picker offers, and an id without an adapter type-checks
 * happily and then throws at the first request — the failure lands on the user
 * mid-conversation rather than at build time. Listing the union members
 * literally here is deliberate: adding a member without an adapter fails this
 * test, whereas deriving the list from the registry would assert nothing.
 */
const EXPECTED: LlmProviderId[] = ['openai', 'anthropic', 'gemini'];

describe('provider registry', () => {
  it('has an adapter for every provider id', () => {
    expect(availableProviderIds().sort()).toEqual([...EXPECTED].sort());
  });

  it.each(EXPECTED)('resolves %s to an adapter that reports its own id', (id) => {
    expect(getProvider(id).id).toBe(id);
  });

  it('refuses an unknown provider rather than returning undefined', () => {
    expect(() => getProvider('nope' as LlmProviderId)).toThrow(/unsupported/i);
  });
});
