import { describe, expect, it } from 'vitest';
import { transportUrlForServer } from './mcpClient';

describe('transportUrlForServer', () => {
  it('routes through the local proxy by default', () => {
    const url = transportUrlForServer(
      'https://example.com/mcp?tenant=a',
      undefined,
      'http://127.0.0.1:4173',
    );

    expect(url.toString()).toBe(
      'http://127.0.0.1:4173/__mcp_proxy?target=https%3A%2F%2Fexample.com%2Fmcp%3Ftenant%3Da',
    );
  });

  it('uses the real server URL when local proxying is disabled', () => {
    const url = transportUrlForServer(
      'https://example.com/mcp',
      false,
      'http://127.0.0.1:4173',
    );

    expect(url.toString()).toBe('https://example.com/mcp');
  });
});
