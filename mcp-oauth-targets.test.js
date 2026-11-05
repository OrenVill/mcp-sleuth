import { describe, expect, it } from 'vitest';
import { isAllowedOAuthTarget } from './mcp-oauth-targets.js';

describe('isAllowedOAuthTarget', () => {
  it('allows token endpoints', () => {
    expect(isAllowedOAuthTarget(new URL('https://a/token'))).toBe(true);
  });
});
