import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { handleMcpProxy, PROXY_PATH } from './proxy.js';

function makeRequest({ method = 'OPTIONS', url = PROXY_PATH, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.pipe = () => {};
  return req;
}

function makeResponse() {
  return {
    statusCode: undefined,
    headers: undefined,
    body: '',
    headersSent: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body = '') {
      this.body += body;
    },
  };
}

describe('handleMcpProxy CORS handling', () => {
  it('answers browser preflight requests with MCP-compatible CORS headers', () => {
    const req = makeRequest({
      headers: {
        origin: 'http://127.0.0.1:4173',
        'access-control-request-headers': 'mcp-session-id,mcp-protocol-version,authorization',
      },
    });
    const res = makeResponse();

    handleMcpProxy(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:4173');
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('mcp-session-id');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('mcp-protocol-version');
    expect(res.headers['Access-Control-Expose-Headers']).toContain('Mcp-Session-Id');
  });
});
