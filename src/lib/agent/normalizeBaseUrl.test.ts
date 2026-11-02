import { describe, expect, it } from 'vitest';
import { joinBaseUrl, normalizeBaseUrl } from './normalizeBaseUrl';

describe('normalizeBaseUrl', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeBaseUrl('  http://127.0.0.1:11434/v1  ')).toBe('http://127.0.0.1:11434/v1');
  });

  it('strips one trailing slash', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:11434/v1/')).toBe('http://127.0.0.1:11434/v1');
  });

  it('strips multiple trailing slashes', () => {
    expect(normalizeBaseUrl('https://host/v1///')).toBe('https://host/v1');
  });

  it('leaves URLs without a trailing slash unchanged', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434/v1');
  });

  it('preserves slashes in the middle of the path', () => {
    expect(normalizeBaseUrl('https://api.example.com/openai/v1/')).toBe(
      'https://api.example.com/openai/v1',
    );
  });
});

describe('joinBaseUrl', () => {
  it('joins a path without duplicating slashes when the base has no trailing slash', () => {
    expect(joinBaseUrl('http://127.0.0.1:11434/v1', '/chat/completions')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    );
  });

  it('joins a path without duplicating slashes when the base has a trailing slash', () => {
    expect(joinBaseUrl('http://127.0.0.1:11434/v1/', '/chat/completions')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    );
  });

  it('trims whitespace on the base before joining', () => {
    expect(joinBaseUrl(' http://host/v1/ ', '/models')).toBe('http://host/v1/models');
  });
});
