import { describe, expect, it } from 'vitest';
import { isAllowedOAuthTarget } from './mcp-oauth-targets.js';

describe('isAllowedOAuthTarget', () => {
  it('allows token endpoints', () => {
    expect(isAllowedOAuthTarget(new URL('https://a/token'))).toBe(true);
    expect(isAllowedOAuthTarget(new URL('https://github.com/login/oauth/access_token'))).toBe(true);
  });
});
