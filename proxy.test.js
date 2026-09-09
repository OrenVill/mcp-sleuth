import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { handleMcpProxy, PROXY_PATH, safeTargetLabel } from './proxy.js';

/** Headers a request from Sleuth's own page carries; the gate now demands them. */
const PAGE_HEADERS = { host: '127.0.0.1:4173', 'sec-fetch-site': 'same-origin' };

function makeRequest({ method = 'OPTIONS', url = PROXY_PATH, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { ...PAGE_HEADERS, ...headers };
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
  it('grants no cross-origin access on a preflight', () => {
    // The proxy reflected the caller's Origin and echoed its requested headers,
    // which made every response readable by any page in the user's browser.
    const req = makeRequest({
      headers: {
        origin: 'https://evil.example',
        'access-control-request-headers': 'mcp-session-id,mcp-protocol-version,authorization',
      },
    });
    const res = makeResponse();

    handleMcpProxy(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Methods']).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Headers']).toBeUndefined();
    expect(res.headers['Access-Control-Expose-Headers']).toBeUndefined();
  });
});

describe('handleMcpProxy provenance', () => {
  it('refuses a cross-site caller before it reaches the target', () => {
    const req = makeRequest({
      method: 'GET',
      url: `${PROXY_PATH}?target=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`,
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    const res = makeResponse();
    handleMcpProxy(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatch(/only for the Sleuth page/i);
  });

  it('refuses a rebound hostname', () => {
    const req = makeRequest({
      method: 'GET',
      url: `${PROXY_PATH}?target=${encodeURIComponent('http://127.0.0.1:1/mcp')}`,
      headers: { host: 'rebind.evil.example:4173' },
    });
    const res = makeResponse();
    handleMcpProxy(req, res);
    expect(res.statusCode).toBe(403);
  });
});

describe('safeTargetLabel', () => {
  it('drops the query string, which is where an MCP token usually rides', () => {
    expect(safeTargetLabel('https://mcp.example/sse?api_key=super-secret')).toBe(
      'https://mcp.example/sse',
    );
  });

  it('never echoes an unparseable target back into the log', () => {
    expect(safeTargetLabel('not a url')).toBe('<unparseable target>');
  });
});

describe('request header filtering', () => {
  it('does not forward the caller cookies to a third-party MCP endpoint', () => {
    const req = makeRequest({
      method: 'POST',
      url: `${PROXY_PATH}?target=${encodeURIComponent('http://127.0.0.1:1/mcp')}`,
      headers: { cookie: 'session=abc', authorization: 'Bearer t', host: '127.0.0.1:4173' },
    });
    const seen = [];
    req.pipe = (upstream) => seen.push(upstream);
    const res = makeResponse();
    handleMcpProxy(req, res);
    // The upstream request object records the headers it was built with.
    const [upstream] = seen;
    expect(upstream.getHeader('cookie')).toBeUndefined();
    expect(upstream.getHeader('authorization')).toBe('Bearer t');
    upstream.destroy();
  });
});
