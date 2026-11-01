import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from './content-security-policy.js';

describe('CONTENT_SECURITY_POLICY', () => {
  it('allows Shiki WebAssembly while keeping scripts same-origin', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
  });
});
