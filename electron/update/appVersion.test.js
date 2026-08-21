import { describe, expect, it, vi } from 'vitest';
import { getPackageJsonPath, resolveCurrentVersion } from './appVersion.js';

describe('resolveCurrentVersion', () => {
  it('prefers the version in our own package.json', () => {
    const readFile = vi.fn(() => JSON.stringify({ version: '1.0.1' }));
    expect(resolveCurrentVersion({ fallback: '43.4.1', readFile })).toBe('1.0.1');
  });

  it('falls back to app.getVersion() when package.json cannot be read', () => {
    const readFile = vi.fn(() => {
      throw new Error('ENOENT');
    });
    expect(resolveCurrentVersion({ fallback: '2.3.4', readFile })).toBe('2.3.4');
  });

  it('falls back when package.json is corrupt', () => {
    const readFile = vi.fn(() => '{ not json');
    expect(resolveCurrentVersion({ fallback: '2.3.4', readFile })).toBe('2.3.4');
  });

  it('falls back when the version field is not a version', () => {
    const readFile = vi.fn(() => JSON.stringify({ version: 'nightly' }));
    expect(resolveCurrentVersion({ fallback: '2.3.4', readFile })).toBe('2.3.4');
  });

  it('is null when neither source is usable, which silences the notifier', () => {
    const readFile = vi.fn(() => '{}');
    expect(resolveCurrentVersion({ fallback: undefined, readFile })).toBeNull();
  });

  it('resolves the real package.json, and it is this project', () => {
    // The guard that matters: unpackaged, app.getVersion() reports Electron's
    // version because package.json has no `main` field on purpose.
    expect(getPackageJsonPath()).toMatch(/package\.json$/);
    expect(resolveCurrentVersion({ fallback: '43.4.1' })).not.toBe('43.4.1');
  });
});
