import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerVersion, parseVersion } from './version.js';

describe('parseVersion', () => {
  it('parses a plain release', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
  });

  it('tolerates the v prefix GitHub tags carry', () => {
    expect(parseVersion('v1.2.3')).toEqual(parseVersion('1.2.3'));
  });

  it('keeps the prerelease tail', () => {
    expect(parseVersion('1.2.3-rc.1')).toMatchObject({ prerelease: 'rc.1' });
  });

  it('treats a missing patch or minor as zero', () => {
    expect(parseVersion('2')).toMatchObject({ major: 2, minor: 0, patch: 0 });
    expect(parseVersion('2.5')).toMatchObject({ major: 2, minor: 5, patch: 0 });
  });

  it('ignores build metadata', () => {
    expect(parseVersion('1.2.3+build.7')).toEqual(parseVersion('1.2.3'));
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a non-string', 42],
    ['no digits at all', 'latest'],
  ])('returns null for %s', (_label, input) => {
    expect(parseVersion(input)).toBeNull();
  });
});

describe('compareVersions', () => {
  it.each([
    ['1.2.3', '1.2.3', 0],
    ['1.2.4', '1.2.3', 1],
    ['1.2.3', '1.2.4', -1],
    ['1.3.0', '1.2.9', 1],
    ['2.0.0', '1.99.99', 1],
    ['v1.2.4', '1.2.3', 1],
    ['1.10.0', '1.9.0', 1],
  ])('%s vs %s -> %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('ranks a prerelease below its own release', () => {
    expect(compareVersions('1.2.0-rc.1', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.0-rc.1')).toBe(1);
  });

  it('ranks a prerelease above the previous release', () => {
    expect(compareVersions('1.2.0-rc.1', '1.1.9')).toBe(1);
  });

  it('orders two prereleases of the same version', () => {
    expect(compareVersions('1.2.0-rc.2', '1.2.0-rc.1')).toBe(1);
    expect(compareVersions('1.2.0-rc.1', '1.2.0-rc.1')).toBe(0);
  });

  it('treats an unparseable version as equal, so nothing is announced on garbage', () => {
    expect(compareVersions('nonsense', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3', 'nonsense')).toBe(0);
  });
});

describe('isNewerVersion', () => {
  it('is true only when the candidate is strictly ahead', () => {
    expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
    expect(isNewerVersion('1.2.2', '1.2.3')).toBe(false);
  });

  it('is false when either side is unparseable', () => {
    expect(isNewerVersion('', '1.2.3')).toBe(false);
    expect(isNewerVersion('1.2.3', null)).toBe(false);
  });
});
