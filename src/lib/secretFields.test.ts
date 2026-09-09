import { describe, it, expect } from 'vitest';
import type { ServerAuth } from '../types';
import {
  SECRET_MASK,
  isKeptSecret,
  keepMarker,
  maskAuthSecrets,
  maskStoredSecret,
  resolveAuthSecrets,
  resolveEnvSecrets,
  resolveStoredSecret,
} from './secretFields';

describe('SECRET_MASK', () => {
  it('is five characters, so copying the field yields a fixed stand-in', () => {
    expect(SECRET_MASK).toHaveLength(5);
    expect(SECRET_MASK).toBe('*****');
  });
});

describe('keepMarker / isKeptSecret', () => {
  it('recognises its own markers', () => {
    expect(isKeptSecret(keepMarker())).toBe(true);
    expect(isKeptSecret(keepMarker('API_KEY'))).toBe(true);
  });

  it('never mistakes a real value for a marker', () => {
    for (const value of ['', 'hunter2', SECRET_MASK, '*'.repeat(64), 'keep-stored-secret']) {
      expect(isKeptSecret(value)).toBe(false);
    }
    expect(isKeptSecret(undefined)).toBe(false);
  });

  it('cannot be typed: the marker contains a NUL', () => {
    expect(keepMarker()).toContain('\u0000');
  });
});

describe('maskStoredSecret / resolveStoredSecret', () => {
  it('masks a present secret and leaves an absent one absent', () => {
    expect(maskStoredSecret('sk-live-1')).toBe(keepMarker());
    expect(maskStoredSecret('')).toBe('');
    expect(maskStoredSecret(undefined)).toBeUndefined();
  });

  it('restores the stored secret only for a marker', () => {
    expect(resolveStoredSecret(keepMarker(), 'sk-live-1')).toBe('sk-live-1');
    expect(resolveStoredSecret('sk-new', 'sk-live-1')).toBe('sk-new');
    expect(resolveStoredSecret('', 'sk-live-1')).toBe('');
    expect(resolveStoredSecret(undefined, 'sk-live-1')).toBeUndefined();
    expect(resolveStoredSecret(keepMarker(), undefined)).toBe('');
  });
});

describe('maskAuthSecrets', () => {
  it('leaves “no auth” alone', () => {
    expect(maskAuthSecrets(undefined)).toBeUndefined();
    expect(maskAuthSecrets({ method: 'none' })).toEqual({ method: 'none' });
  });

  it('replaces a stored bearer token with a marker', () => {
    expect(maskAuthSecrets({ method: 'bearer', bearerToken: 'tok-abc' })).toEqual({
      method: 'bearer',
      bearerToken: keepMarker(),
    });
  });

  it('replaces a stored API key but keeps the header name visible', () => {
    expect(
      maskAuthSecrets({ method: 'api_key', apiKeyHeader: 'X-Custom', apiKeyValue: 'k-1' }),
    ).toEqual({ method: 'api_key', apiKeyHeader: 'X-Custom', apiKeyValue: keepMarker() });
  });

  it('replaces a stored password but keeps the username visible', () => {
    expect(
      maskAuthSecrets({ method: 'basic', basicUsername: 'ada', basicPassword: 'hunter2' }),
    ).toEqual({ method: 'basic', basicUsername: 'ada', basicPassword: keepMarker() });
  });

  it('leaves an absent or empty secret empty — there is nothing to keep', () => {
    expect(maskAuthSecrets({ method: 'bearer', bearerToken: '' })).toEqual({
      method: 'bearer',
      bearerToken: '',
    });
    expect(maskAuthSecrets({ method: 'basic', basicUsername: 'ada' })).toEqual({
      method: 'basic',
      basicUsername: 'ada',
      basicPassword: undefined,
    });
  });

  it('never returns the plaintext it was given', () => {
    const masked = maskAuthSecrets({ method: 'basic', basicUsername: 'ada', basicPassword: 'hunter2' });
    expect(JSON.stringify(masked)).not.toContain('hunter2');
  });
});

describe('resolveAuthSecrets', () => {
  const stored: ServerAuth = { method: 'basic', basicUsername: 'ada', basicPassword: 'hunter2' };

  it('restores the stored secret when the form kept it', () => {
    const submitted: ServerAuth = { method: 'basic', basicUsername: 'ada', basicPassword: keepMarker() };
    expect(resolveAuthSecrets(submitted, stored)).toEqual(stored);
  });

  it('takes a newly typed secret over the stored one', () => {
    const submitted: ServerAuth = { method: 'basic', basicUsername: 'ada', basicPassword: 'new-pass' };
    expect(resolveAuthSecrets(submitted, stored)?.basicPassword).toBe('new-pass');
  });

  it('clears the secret when the form submits an empty field', () => {
    const submitted: ServerAuth = { method: 'basic', basicUsername: 'ada', basicPassword: '' };
    expect(resolveAuthSecrets(submitted, stored)?.basicPassword).toBe('');
  });

  it('resolves a marker to empty when nothing is stored', () => {
    const submitted: ServerAuth = { method: 'bearer', bearerToken: keepMarker() };
    expect(resolveAuthSecrets(submitted, undefined)?.bearerToken).toBe('');
  });

  it('never carries a secret across a change of auth method', () => {
    const submitted: ServerAuth = { method: 'bearer', bearerToken: keepMarker() };
    expect(resolveAuthSecrets(submitted, stored)?.bearerToken).toBe('');
  });

  it('resolves the API key against the stored API key', () => {
    const storedKey: ServerAuth = { method: 'api_key', apiKeyHeader: 'X-API-Key', apiKeyValue: 'k-1' };
    const submitted: ServerAuth = {
      method: 'api_key',
      apiKeyHeader: 'X-Other',
      apiKeyValue: keepMarker(),
    };
    expect(resolveAuthSecrets(submitted, storedKey)).toEqual({
      method: 'api_key',
      apiKeyHeader: 'X-Other',
      apiKeyValue: 'k-1',
    });
  });

  it('leaves “no auth” alone', () => {
    expect(resolveAuthSecrets(undefined, stored)).toBeUndefined();
    expect(resolveAuthSecrets({ method: 'none' }, stored)).toEqual({ method: 'none' });
  });

  it('never lets a marker reach the caller', () => {
    const submitted: ServerAuth = { method: 'bearer', bearerToken: keepMarker('nope') };
    expect(JSON.stringify(resolveAuthSecrets(submitted, undefined))).not.toContain('keep-stored-secret');
  });
});

describe('resolveEnvSecrets', () => {
  const stored = { API_KEY: 'k-1', TOKEN: 't-1' };

  it('restores kept values', () => {
    const submitted = { API_KEY: keepMarker('API_KEY'), TOKEN: keepMarker('TOKEN') };
    expect(resolveEnvSecrets(submitted, stored)).toEqual(stored);
  });

  it('follows the marker when the row was renamed', () => {
    const submitted = { RENAMED: keepMarker('API_KEY') };
    expect(resolveEnvSecrets(submitted, stored)).toEqual({ RENAMED: 'k-1' });
  });

  it('takes newly typed values and drops removed rows', () => {
    const submitted = { API_KEY: 'k-2' };
    expect(resolveEnvSecrets(submitted, stored)).toEqual({ API_KEY: 'k-2' });
  });

  it('resolves a marker with no stored counterpart to empty', () => {
    expect(resolveEnvSecrets({ NEW: keepMarker('NEW') }, stored)).toEqual({ NEW: '' });
    expect(resolveEnvSecrets({ NEW: keepMarker('NEW') }, undefined)).toEqual({ NEW: '' });
  });

  it('leaves an absent map absent', () => {
    expect(resolveEnvSecrets(undefined, stored)).toBeUndefined();
  });

  it('never lets a marker reach the caller', () => {
    const resolved = resolveEnvSecrets({ A: keepMarker('missing') }, stored);
    expect(JSON.stringify(resolved)).not.toContain('keep-stored-secret');
  });
});
