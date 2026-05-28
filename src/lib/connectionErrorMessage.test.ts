import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it } from 'vitest';
import { formatConnectionError } from './connectionErrorMessage';

describe('formatConnectionError', () => {
  it('maps 404 to not-found guidance', () => {
    const out = formatConnectionError(
      new StreamableHTTPError(404, 'Not Found'),
    );
    expect(out).toContain('Not found');
    expect(out).toContain('HTTP 404');
  });

  it('maps 502 with ECONNREFUSED to connection refused', () => {
    const out = formatConnectionError(
      new StreamableHTTPError(502, 'Bad Gateway: ECONNREFUSED 127.0.0.1:7'),
    );
    expect(out).toContain('refused');
  });

  it('maps UnauthorizedError to auth guidance', () => {
    const out = formatConnectionError(new UnauthorizedError());
    expect(out).toContain('Authentication');
  });

  it('maps stdio bridge missing to local server guidance', () => {
    const out = formatConnectionError(
      new Error(
        'Stdio requires the local explorer server. Run npm run dev or mcp-explorer instead of opening dist/index.html directly.',
      ),
    );
    expect(out).toContain('Stdio requires the local explorer server');
    expect(out).toContain('npm run dev');
  });

  it('maps spawn ENOENT to could not start process', () => {
    const out = formatConnectionError(new Error('spawn not-a-real-command ENOENT'));
    expect(out).toContain('Could not start process');
    expect(out).toContain('not-a-real-command');
  });
});
