import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHost, resetHost, setHost } from './index';
import type { Host } from './types';

const fakeHost = { kind: 'electron' } as unknown as Host;

describe('getHost', () => {
  afterEach(() => {
    resetHost();
  });

  it('returns the browser host by default', () => {
    expect(getHost().kind).toBe('browser');
  });

  it('returns an explicitly registered host', () => {
    setHost(fakeHost);
    expect(getHost()).toBe(fakeHost);
  });

  it('restores the default after reset', () => {
    setHost(fakeHost);
    resetHost();
    expect(getHost().kind).toBe('browser');
  });
});

describe('bridge detection', () => {
  afterEach(() => {
    resetHost();
    vi.unstubAllGlobals();
  });

  it('picks the electron host when the preload bridge is present', () => {
    vi.stubGlobal('window', {
      mcpExplorer: {
        kind: 'electron',
        invoke: async () => ({ ok: true, value: undefined }),
        onToolsChanged: () => () => {},
        onClosed: () => () => {},
      },
    });

    expect(getHost().kind).toBe('electron');
  });

  it('falls back to the browser host when the bridge is absent', () => {
    vi.stubGlobal('window', {});
    expect(getHost().kind).toBe('browser');
  });

  it('falls back to the browser host when there is no window at all', () => {
    expect(getHost().kind).toBe('browser');
  });
});
