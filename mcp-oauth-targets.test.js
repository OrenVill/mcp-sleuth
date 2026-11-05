import { describe, expect, it } from 'vitest';
import { isAllowedOAuthTarget } from './mcp-oauth-targets.js';

describe('isAllowedOAuthTarget', () => {
  it('allows token endpoints', () => {
    expect(isAllowedOAuthTarget(new URL('https://a/token'))).toBe(true);
    expect(isAllowedOAuthTarget(new URL('https://github.com/login/oauth/access_token'))).toBe(true);
  });

  it('allows GitHub Copilot protected-resource metadata paths', () => {
    expect(
      isAllowedOAuthTarget(
        new URL('https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp'),
      ),
    ).toBe(true);
    expect(
      isAllowedOAuthTarget(
        new URL('https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/_ping'),
      ),
    ).toBe(true);
  });

  it('allows path-suffixed authorization-server metadata', () => {
    expect(
      isAllowedOAuthTarget(
        new URL('https://github.com/.well-known/oauth-authorization-server/login/oauth'),
      ),
    ).toBe(true);
  });
});
