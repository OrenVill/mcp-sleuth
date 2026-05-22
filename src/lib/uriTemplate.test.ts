import { describe, expect, test } from 'vitest';
import { extractUriTemplateVars, fillUriTemplate } from './uriTemplate';

describe('extractUriTemplateVars', () => {
  test('returns empty array for template with no vars', () => {
    expect(extractUriTemplateVars('file:///static/path')).toEqual([]);
  });

  test('extracts single variable', () => {
    expect(extractUriTemplateVars('file:///{path}')).toEqual(['path']);
  });

  test('extracts multiple variables', () => {
    expect(extractUriTemplateVars('https://api.example.com/{owner}/{repo}/issues/{id}')).toEqual(['owner', 'repo', 'id']);
  });

  test('deduplicates repeated variables', () => {
    expect(extractUriTemplateVars('{a}/{a}/{b}')).toEqual(['a', 'b']);
  });
});

describe('fillUriTemplate', () => {
  test('replaces all variables with their values', () => {
    expect(fillUriTemplate('file:///{path}', { path: 'docs/readme.md' })).toBe('file:///docs/readme.md');
  });

  test('leaves unfilled variables as empty string', () => {
    expect(fillUriTemplate('{owner}/{repo}', { owner: 'acme' })).toBe('acme/');
  });

  test('handles template with no variables', () => {
    expect(fillUriTemplate('file:///static', {})).toBe('file:///static');
  });
});
