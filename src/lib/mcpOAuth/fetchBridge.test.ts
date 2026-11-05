import { describe, expect, test } from 'vitest';
import { MCP_OAUTH_PROXY_PATH } from './constants';
import { oauthProxyWrapTarget } from './fetchBridge';

describe('oauthProxyWrapTarget', () => {
  const origin = 'http://127.0.0.1:5173';

  test('does not wrap same-origin MCP proxy URLs', () => {
    const mcp = `${origin}/__mcp_proxy?target=${encodeURIComponent('http://127.0.0.1:3001/mcp')}`;
    expect(oauthProxyWrapTarget(mcp, origin)).toBeNull();
  });

  test('wraps cross-origin OAuth IdP URLs', () => {
    const idp = 'https://auth.example.com/oauth/token';
    const wrapped = oauthProxyWrapTarget(idp, origin);
    expect(wrapped).toContain(MCP_OAUTH_PROXY_PATH);
    expect(wrapped).toContain(encodeURIComponent(idp));
  });
});
