import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('CLI smoke', () => {
  it('help exits 0 after build', () => {
    const bin = resolve(process.cwd(), 'bin/mcp-detective.js');
    const result = spawnSync(process.execPath, [bin, 'help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('readiness');
  });

  it('readiness does not start the browser daemon', () => {
    const bin = resolve(process.cwd(), 'bin/mcp-detective.js');
    const result = spawnSync(process.execPath, [bin, 'readiness'], {
      encoding: 'utf8',
      env: { ...process.env, MCP_DETECTIVE_VAULT_PASSPHRASE: '' },
    });
    expect(result.stdout).not.toMatch(/started on http/);
    expect(result.stderr + result.stdout).toMatch(/vault|passphrase|Non-interactive/i);
  });
});
