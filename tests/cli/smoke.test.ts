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
});
