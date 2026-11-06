import { describe, expect, it } from 'vitest';
import { mergeTokensIntoSession } from './types';

describe('mergeTokensIntoSession', () => {
  it('stores access tokens from OAuth token responses', () => {
    expect(
      mergeTokensIntoSession(undefined, { access_token: 'a', token_type: 'Bearer' }).accessToken,
    ).toBe('a');
  });
});
