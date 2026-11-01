import { describe, expect, it } from 'vitest';
import { isAllowedHost, isSameOriginRequest, guardLocalRequest } from './request-guard.js';

function req(headers, socket) {
  return { headers, socket: socket ?? { remoteAddress: '127.0.0.1' } };
}

describe('isSameOriginRequest', () => {
  it('accepts a browser request the page made against itself', () => {
    expect(
      isSameOriginRequest(req({ 'sec-fetch-site': 'same-origin', host: '127.0.0.1:4173' })),
    ).toBe(true);
  });

  it('accepts a request whose Origin matches its Host', () => {
    expect(
      isSameOriginRequest(req({ origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4173' })),
    ).toBe(true);
  });

  it('rejects a cross-site fetch', () => {
    expect(isSameOriginRequest(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isSameOriginRequest(req({ 'sec-fetch-site': 'same-site' }))).toBe(false);
  });

  it('rejects an Origin that is not the server itself', () => {
    expect(
      isSameOriginRequest(req({ origin: 'https://evil.example', host: '127.0.0.1:4173' })),
    ).toBe(false);
  });

  it('fails closed when neither header is present', () => {
    // A no-cors GET from a page on a browser without Fetch Metadata sends
    // neither header. Allowing that is the bypass this guard exists to close.
    expect(isSameOriginRequest(req({ host: '127.0.0.1:4173' }))).toBe(false);
  });

  it('rejects a cross-site request even when Origin happens to match Host', () => {
    expect(
      isSameOriginRequest(
        req({ 'sec-fetch-site': 'cross-site', origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4173' }),
      ),
    ).toBe(false);
  });
});

describe('isAllowedHost', () => {
  const bound = { host: '127.0.0.1', port: 4173 };

  it('accepts the loopback literal the server is bound to', () => {
    expect(isAllowedHost(req({ host: '127.0.0.1:4173' }), bound)).toBe(true);
  });

  it('accepts localhost, which no attacker can point elsewhere', () => {
    expect(isAllowedHost(req({ host: 'localhost:4173' }), bound)).toBe(true);
  });

  it('accepts a bracketed IPv6 literal', () => {
    expect(isAllowedHost(req({ host: '[::1]:4173' }), bound)).toBe(true);
  });

  it('accepts any bare IP literal, which cannot be DNS-rebound', () => {
    expect(isAllowedHost(req({ host: '192.168.1.5:4173' }), bound)).toBe(true);
  });

  it('rejects a domain name, which is how rebinding arrives', () => {
    expect(isAllowedHost(req({ host: 'rebind.evil.example:4173' }), bound)).toBe(false);
  });

  it('rejects a missing Host header', () => {
    expect(isAllowedHost(req({}), bound)).toBe(false);
  });

  it('rejects a port other than the one the server listens on', () => {
    expect(isAllowedHost(req({ host: '127.0.0.1:9999' }), bound)).toBe(false);
  });

  it('accepts a name the operator allowlisted', () => {
    expect(
      isAllowedHost(req({ host: 'sleuth.internal:4173' }), {
        ...bound,
        allowedHosts: ['sleuth.internal'],
      }),
    ).toBe(true);
  });

  it('accepts the non-loopback host the server was explicitly bound to', () => {
    expect(
      isAllowedHost(req({ host: 'box.lan:4173' }), { host: 'box.lan', port: 4173 }),
    ).toBe(true);
  });

  it('ignores the port when the server port is unknown', () => {
    expect(isAllowedHost(req({ host: '127.0.0.1:1234' }), { host: '127.0.0.1' })).toBe(true);
  });
});

describe('guardLocalRequest', () => {
  const bound = { host: '127.0.0.1', port: 4173 };
  const good = { 'sec-fetch-site': 'same-origin', host: '127.0.0.1:4173' };

  it('allows the app talking to its own endpoints', () => {
    expect(guardLocalRequest(req(good), bound)).toEqual({ ok: true });
  });

  it('names the Host failure so it can be logged', () => {
    const verdict = guardLocalRequest(
      req({ 'sec-fetch-site': 'same-origin', host: 'rebind.evil.example:4173' }),
      bound,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('host');
  });

  it('names the origin failure', () => {
    const verdict = guardLocalRequest(
      req({ 'sec-fetch-site': 'cross-site', host: '127.0.0.1:4173' }),
      bound,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('origin');
  });

  it('requires a JSON content type when the caller asks for one', () => {
    const verdict = guardLocalRequest(req({ ...good, 'content-type': 'text/plain' }), {
      ...bound,
      requireJson: true,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('content-type');
  });

  it('accepts a JSON content type with parameters', () => {
    expect(
      guardLocalRequest(req({ ...good, 'content-type': 'application/json; charset=utf-8' }), {
        ...bound,
        requireJson: true,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a missing content type when JSON is required', () => {
    // Without this, the request stays a CORS simple request and never preflights.
    expect(guardLocalRequest(req(good), { ...bound, requireJson: true }).reason).toBe(
      'content-type',
    );
  });
});
