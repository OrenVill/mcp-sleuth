import { describe, expect, it } from 'vitest';
import { isMcpOAuthProxyRequest, MCP_OAUTH_PROXY_PATH } from './mcp-oauth-proxy.js';

describe('isMcpOAuthProxyRequest', () => {
  it('matches the proxy path', () => {
    expect(isMcpOAuthProxyRequest(MCP_OAUTH_PROXY_PATH)).toBe(true);
  });
});
