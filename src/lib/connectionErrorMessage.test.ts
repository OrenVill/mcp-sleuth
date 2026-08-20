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
        'Stdio requires the local explorer server. Run npm run dev or mcp-sleuth instead of opening dist/index.html directly.',
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

describe('electron IPC errors', () => {
  it('treats an E_CONNECT code like a transport failure', () => {
    const err = Object.assign(new Error('fetch failed'), { code: 'E_CONNECT' });
    const message = formatConnectionError(err);

    expect(message).toBeTruthy();
    expect(message).not.toContain('[object Object]');
  });

  it('gives the same refused-connection guidance as the browser path', () => {
    const err = Object.assign(new Error('ECONNREFUSED 127.0.0.1:9999'), {
      code: 'E_CONNECT',
    });

    expect(formatConnectionError(err)).toContain('Connection refused');
  });

  it('gives spawn guidance for a stdio failure that crossed IPC', () => {
    const err = Object.assign(new Error('spawn nonesuch ENOENT'), {
      code: 'E_CONNECT_STDIO',
    });
    const message = formatConnectionError(err);

    expect(message).toContain('Could not start process');
    expect(message).toContain('nonesuch');
  });

  it('formats a coded error identically to the same error without a code', () => {
    const plain = new Error('ECONNREFUSED 127.0.0.1:9999');
    const coded = Object.assign(new Error('ECONNREFUSED 127.0.0.1:9999'), {
      code: 'E_CONNECT',
    });

    expect(formatConnectionError(coded)).toBe(formatConnectionError(plain));
  });
});
