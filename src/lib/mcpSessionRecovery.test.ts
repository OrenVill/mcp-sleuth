import { describe, expect, it } from 'vitest';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { isSessionLostError, isSseDisconnectSuspect } from './mcpSessionRecovery';

describe('isSessionLostError', () => {
  it('treats stale session HTTP errors as recoverable', () => {
    expect(isSessionLostError(new StreamableHTTPError(404, 'Session not found'))).toBe(true);
    expect(isSessionLostError(new Error('Session expired'))).toBe(true);
  });

  it('does not treat auth failures as session loss', () => {
    expect(isSessionLostError(new StreamableHTTPError(401, 'Unauthorized'))).toBe(false);
    expect(isSessionLostError(new StreamableHTTPError(403, 'Forbidden'))).toBe(false);
  });
});

describe('isSseDisconnectSuspect', () => {
  it('flags SSE reconnect exhaustion messages', () => {
    expect(isSseDisconnectSuspect(new Error('Maximum reconnection attempts (3) exceeded.'))).toBe(
      true,
    );
    expect(isSseDisconnectSuspect(new Error('unrelated'))).toBe(false);
  });
});
