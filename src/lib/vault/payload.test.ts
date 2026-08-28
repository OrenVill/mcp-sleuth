import { describe, expect, it } from 'vitest';
import { parseVaultPayload, serializeVaultPayload } from './service';

describe('parseVaultPayload', () => {
  it('reads a v1 bare array as servers with no llm configs', () => {
    const raw = JSON.stringify([{ id: 's1', name: 'One', url: 'http://x' }]);
    expect(parseVaultPayload(raw)).toEqual({
      version: 2,
      servers: [{ id: 's1', name: 'One', url: 'http://x' }],
      llmConfigs: [],
    });
  });

  it('reads a v2 object', () => {
    const raw = JSON.stringify({
      version: 2,
      servers: [],
      llmConfigs: [
        { id: 'l1', label: 'Local', provider: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3' },
      ],
    });
    expect(parseVaultPayload(raw).llmConfigs).toHaveLength(1);
  });

  it('defaults missing fields on a malformed object', () => {
    expect(parseVaultPayload(JSON.stringify({ version: 2 }))).toEqual({
      version: 2,
      servers: [],
      llmConfigs: [],
    });
  });

  it('throws on unparseable text', () => {
    expect(() => parseVaultPayload('not json')).toThrow(/unreadable/i);
  });

  it('throws on a payload that is neither array nor object', () => {
    expect(() => parseVaultPayload('42')).toThrow(/invalid/i);
  });

  it('round-trips through serialize', () => {
    const payload = { version: 2 as const, servers: [], llmConfigs: [] };
    expect(parseVaultPayload(serializeVaultPayload(payload))).toEqual(payload);
  });
});
