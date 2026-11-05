import { describe, expect, it, vi } from 'vitest';
import { createDetectiveOAuthProvider } from './provider';
import type { ServerAuth } from '../../types';

describe('DetectiveOAuthProvider', () => {
  it('persists tokens through callbacks', async () => {
    let auth: ServerAuth = { method: 'oauth', oauth: {} };
    const provider = createDetectiveOAuthProvider('http://127.0.0.1:4173', {
      getAuth: () => auth,
      onSessionChange: (session) => {
        auth = { method: 'oauth', oauth: session };
      },
      onRedirect: vi.fn(),
    });
    await provider.saveTokens({ access_token: 't', token_type: 'Bearer' });
    expect(auth.oauth?.accessToken).toBe('t');
  });
});
