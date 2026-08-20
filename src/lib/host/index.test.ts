import { afterEach, describe, expect, it } from 'vitest';
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
