import { describe, expect, it } from 'vitest';
import {
  LLM_PROXY_PATH,
  handleLlmProxy,
  isAllowedTarget,
  isLlmProxyRequest,
  isSameOriginRequest,
} from './llm-proxy.js';

/** Minimal ServerResponse stand-in that records what the handler wrote. */
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers ?? {};
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
  };
}

describe('isLlmProxyRequest', () => {
  it('matches the bare path', () => {
    expect(isLlmProxyRequest(LLM_PROXY_PATH)).toBe(true);
  });

  it('matches the path with a query string', () => {
    expect(isLlmProxyRequest(`${LLM_PROXY_PATH}?provider=openai`)).toBe(true);
  });

  it('does not match an unrelated path', () => {
    expect(isLlmProxyRequest('/__mcp_proxy')).toBe(false);
  });

  it('does not match a path that merely starts with it', () => {
    expect(isLlmProxyRequest('/__llm_proxyevil')).toBe(false);
  });
});

describe('isAllowedTarget', () => {
  it('allows an OpenAI chat completion on any host, so self-hosted models work', () => {
    expect(isAllowedTarget('openai', new URL('http://127.0.0.1:11434/v1/chat/completions'))).toBe(true);
    expect(isAllowedTarget('openai', new URL('https://api.openai.com/v1/chat/completions'))).toBe(true);
  });

  it('allows the models endpoint', () => {
    expect(isAllowedTarget('openai', new URL('http://127.0.0.1:11434/v1/models'))).toBe(true);
  });

  it('rejects an unrelated path on an allowed host', () => {
    expect(isAllowedTarget('openai', new URL('https://api.openai.com/v1/files'))).toBe(false);
  });

  it('rejects a path that belongs to a different provider', () => {
    expect(isAllowedTarget('openai', new URL('https://api.anthropic.com/v1/messages'))).toBe(false);
  });

  it('allows anthropic and gemini endpoints', () => {
    expect(isAllowedTarget('anthropic', new URL('https://api.anthropic.com/v1/messages'))).toBe(true);
    expect(
      isAllowedTarget('gemini', new URL('https://g.dev/v1beta/models/x:streamGenerateContent')),
    ).toBe(true);
  });

  it('rejects an unknown provider', () => {
    expect(isAllowedTarget('nope', new URL('https://example.com/v1/chat/completions'))).toBe(false);
  });
});

describe('handleLlmProxy rejections', () => {
  it('rejects a missing target', async () => {
    const res = fakeRes();
    await handleLlmProxy({ method: 'POST', url: `${LLM_PROXY_PATH}?provider=openai`, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/target/i);
  });

  it('rejects a missing provider', async () => {
    const res = fakeRes();
    const url = `${LLM_PROXY_PATH}?target=${encodeURIComponent('https://api.openai.com/v1/chat/completions')}`;
    await handleLlmProxy({ method: 'POST', url, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/provider/i);
  });

  it('rejects a non-http target', async () => {
    const res = fakeRes();
    const url = `${LLM_PROXY_PATH}?provider=openai&target=${encodeURIComponent('file:///etc/passwd')}`;
    await handleLlmProxy({ method: 'POST', url, headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a target the provider does not own', async () => {
    const res = fakeRes();
    const url = `${LLM_PROXY_PATH}?provider=openai&target=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}`;
    await handleLlmProxy({ method: 'POST', url, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/not a recognised/i);
  });
});

describe('isSameOriginRequest', () => {
  it('accepts a same-origin browser request', () => {
    expect(
      isSameOriginRequest({ headers: { 'sec-fetch-site': 'same-origin', host: '127.0.0.1:4173' } }),
    ).toBe(true);
  });

  it('rejects a cross-site browser request', () => {
    expect(isSameOriginRequest({ headers: { 'sec-fetch-site': 'cross-site' } })).toBe(false);
  });

  it('rejects a same-site-but-not-same-origin request', () => {
    expect(isSameOriginRequest({ headers: { 'sec-fetch-site': 'same-site' } })).toBe(false);
  });

  it('rejects a mismatched Origin header', () => {
    expect(
      isSameOriginRequest({ headers: { origin: 'https://evil.example', host: '127.0.0.1:4173' } }),
    ).toBe(false);
  });

  it('accepts a matching Origin header', () => {
    expect(
      isSameOriginRequest({ headers: { origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4173' } }),
    ).toBe(true);
  });

  it('accepts a non-browser client that sends neither header', () => {
    expect(isSameOriginRequest({ headers: {} })).toBe(true);
  });
});

describe('handleLlmProxy origin enforcement', () => {
  it('refuses a cross-site request before parsing the target', async () => {
    const res = fakeRes();
    const url = `${LLM_PROXY_PATH}?provider=openai&target=${encodeURIComponent('http://internal.example/v1/chat/completions')}`;
    await handleLlmProxy(
      { method: 'POST', url, headers: { 'sec-fetch-site': 'cross-site' } },
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatch(/cross-origin/i);
  });
});
