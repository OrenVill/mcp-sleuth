import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FEED_URL,
  MAX_NOTES_LENGTH,
  fetchLatestRelease,
  parseRelease,
  resolveFeedUrl,
} from './feed.js';

/** Trimmed to the fields used, from a real GitHub /releases/latest response. */
const PAYLOAD = {
  tag_name: 'v1.2.0',
  name: 'v1.2.0',
  body: '### Features\n\n* stdio reconnect ([#41](https://github.com/x/y/pull/41))',
  html_url: 'https://github.com/OrenVill/mcp-sleuth/releases/tag/v1.2.0',
  published_at: '2026-08-21T10:00:00Z',
  draft: false,
  prerelease: false,
};

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('parseRelease', () => {
  it('pulls the fields the notifier needs', () => {
    expect(parseRelease(PAYLOAD)).toEqual({
      version: '1.2.0',
      name: 'v1.2.0',
      notes: PAYLOAD.body,
      url: PAYLOAD.html_url,
      publishedAt: '2026-08-21T10:00:00Z',
    });
  });

  it('strips the leading v from the tag so it compares against app.getVersion()', () => {
    expect(parseRelease({ ...PAYLOAD, tag_name: 'v3.0.1' }).version).toBe('3.0.1');
  });

  it('falls back to the tag when the release has no name', () => {
    expect(parseRelease({ ...PAYLOAD, name: null }).name).toBe('v1.2.0');
  });

  it('caps the notes, since they are rendered in a banner', () => {
    const parsed = parseRelease({ ...PAYLOAD, body: 'x'.repeat(MAX_NOTES_LENGTH + 500) });
    expect(parsed.notes.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH + 1);
    expect(parsed.notes.endsWith('…')).toBe(true);
  });

  it('tolerates a missing body', () => {
    expect(parseRelease({ ...PAYLOAD, body: null }).notes).toBe('');
  });

  it.each([
    ['null', null],
    ['a non-object', 'nope'],
    ['no tag_name', { name: 'v1' }],
    ['an unparseable tag', { tag_name: 'nightly' }],
  ])('returns null for %s', (_label, payload) => {
    expect(parseRelease(payload)).toBeNull();
  });

  it('refuses a draft or a prerelease', () => {
    expect(parseRelease({ ...PAYLOAD, draft: true })).toBeNull();
    expect(parseRelease({ ...PAYLOAD, prerelease: true })).toBeNull();
  });

  it('rejects a release url that is not http(s), which would reach the shell', () => {
    expect(parseRelease({ ...PAYLOAD, html_url: 'file:///etc/passwd' })).toBeNull();
  });
});

describe('fetchLatestRelease', () => {
  it('requests the feed url with a User-Agent and no credentials', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    await fetchLatestRelease({ fetch: fetchFn, url: DEFAULT_FEED_URL });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(DEFAULT_FEED_URL);
    expect(init.headers['User-Agent']).toMatch(/sleuth/i);
    expect(init.headers.Accept).toBe('application/vnd.github+json');
    expect(init.credentials).toBe('omit');
    expect(Object.keys(init.headers)).not.toContain('Authorization');
  });

  it('resolves the parsed release', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    await expect(fetchLatestRelease({ fetch: fetchFn })).resolves.toMatchObject({
      version: '1.2.0',
    });
  });

  it('reports a rate limit distinctly — it is the likeliest failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ message: 'API rate limit exceeded' }, { ok: false, status: 403 }),
    );
    await expect(fetchLatestRelease({ fetch: fetchFn })).rejects.toThrow(/rate limit/i);
  });

  it('reports a repository with no releases yet', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Not Found' }, { ok: false, status: 404 }));
    await expect(fetchLatestRelease({ fetch: fetchFn })).rejects.toThrow(/no releases/i);
  });

  it('reports any other HTTP failure with its status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    await expect(fetchLatestRelease({ fetch: fetchFn })).rejects.toThrow(/500/);
  });

  it('reports a timeout in words a user can read', async () => {
    const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const fetchFn = vi.fn().mockRejectedValue(abort);
    await expect(fetchLatestRelease({ fetch: fetchFn })).rejects.toThrow(/timed out/i);
  });

  it('rejects when the payload is not a usable release', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ tag_name: 'nightly' }));
    await expect(fetchLatestRelease({ fetch: fetchFn })).rejects.toThrow(/release/i);
  });

  it('aborts the request once the timeout elapses', async () => {
    const timers = [];
    const fetchFn = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    const promise = fetchLatestRelease({
      fetch: fetchFn,
      timeoutMs: 10,
      setTimeoutFn: (fn) => {
        timers.push(fn);
        return 1;
      },
      clearTimeoutFn: () => {},
    });

    timers.forEach((fn) => fn());
    await expect(promise).rejects.toThrow(/timed out/i);
  });
});

describe('resolveFeedUrl', () => {
  it('defaults to the project repository', () => {
    expect(resolveFeedUrl({})).toBe(DEFAULT_FEED_URL);
    expect(DEFAULT_FEED_URL).toContain('OrenVill/mcp-sleuth');
  });

  it('honours MCP_SLEUTH_UPDATE_FEED_URL, for the e2e fixture and for forks', () => {
    expect(resolveFeedUrl({ MCP_SLEUTH_UPDATE_FEED_URL: 'http://127.0.0.1:4599/latest' })).toBe(
      'http://127.0.0.1:4599/latest',
    );
  });

  it('ignores a blank override', () => {
    expect(resolveFeedUrl({ MCP_SLEUTH_UPDATE_FEED_URL: '   ' })).toBe(DEFAULT_FEED_URL);
  });
});
