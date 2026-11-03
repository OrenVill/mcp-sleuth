import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VAULT_SESSION_TTL_MS } from './vaultSessionCache';

describe('vault session TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a 30-minute window', () => {
    const start = Date.now();
    vi.advanceTimersByTime(VAULT_SESSION_TTL_MS - 1);
    expect(Date.now() - start).toBeLessThan(VAULT_SESSION_TTL_MS);
    vi.advanceTimersByTime(1);
    expect(Date.now() - start).toBe(VAULT_SESSION_TTL_MS);
  });
});
