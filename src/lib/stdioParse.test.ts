import { describe, it, expect } from 'vitest';
import { parseArgsLines, envRowsToMap, hasDuplicateEnvKeys, stdioBridgeMcpUrl } from './stdioParse';

describe('parseArgsLines', () => {
  it('splits non-empty lines and trims', () => {
    expect(parseArgsLines('-y\n@pkg/foo\n\n')).toEqual(['-y', '@pkg/foo']);
  });
  it('returns empty array for blank textarea', () => {
    expect(parseArgsLines('  \n  ')).toEqual([]);
  });
});

describe('hasDuplicateEnvKeys', () => {
  it('detects duplicate keys', () => {
    expect(
      hasDuplicateEnvKeys([
        { key: 'A', value: '1' },
        { key: 'A', value: '2' },
      ]),
    ).toBe(true);
    expect(hasDuplicateEnvKeys([{ key: 'A', value: '1' }])).toBe(false);
  });
});

describe('envRowsToMap', () => {
  it('builds map and envKeys from rows', () => {
    const { env, envKeys } = envRowsToMap([
      { key: 'API_KEY', value: 'secret' },
      { key: 'DEBUG', value: '1' },
    ]);
    expect(env).toEqual({ API_KEY: 'secret', DEBUG: '1' });
    expect(envKeys).toEqual(['API_KEY', 'DEBUG']);
  });
  it('skips rows with empty keys', () => {
    const { env, envKeys } = envRowsToMap([{ key: '', value: 'x' }, { key: 'A', value: 'b' }]);
    expect(env).toEqual({ A: 'b' });
    expect(envKeys).toEqual(['A']);
  });
});

describe('stdioBridgeMcpUrl', () => {
  it('builds same-origin bridge path', () => {
    expect(stdioBridgeMcpUrl('my-server', 'http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/__mcp_stdio/my-server/mcp',
    );
  });
});
