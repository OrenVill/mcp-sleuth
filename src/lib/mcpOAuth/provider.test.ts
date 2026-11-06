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

  it('validateResourceURL trusts protected-resource metadata over the local proxy URL', async () => {
    const provider = createDetectiveOAuthProvider('http://127.0.0.1:5173', {
      getAuth: () => ({ method: 'oauth', oauth: {} }),
      onSessionChange: () => {},
      onRedirect: vi.fn(),
    });
    const proxyUrl = new URL(
      'http://127.0.0.1:5173/__mcp_proxy?target=https%3A%2F%2Fapi.githubcopilot.com%2Fmcp%2F',
    );
    const resource = await provider.validateResourceURL!(
      proxyUrl,
      'https://api.githubcopilot.com/mcp',
    );
    if (!resource) {
      throw new Error('expected validateResourceURL to return a URL');
    }
    expect(resource.href).toBe('https://api.githubcopilot.com/mcp');
  });
});
