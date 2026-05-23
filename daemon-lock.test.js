import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readLock, writeLock, deleteLock, isAlive } from './daemon-lock.js';

const TEST_DIR = `/tmp/mcp-explorer-test-${process.pid}`;

describe('daemon-lock', () => {
  const originalEnv = process.env.MCP_EXPLORER_DATA_DIR;

  beforeEach(async () => {
    process.env.MCP_EXPLORER_DATA_DIR = TEST_DIR;
    await deleteLock();
  });

  afterEach(async () => {
    await deleteLock();
    if (originalEnv === undefined) {
      delete process.env.MCP_EXPLORER_DATA_DIR;
    } else {
      process.env.MCP_EXPLORER_DATA_DIR = originalEnv;
    }
  });

  it('readLock returns null when no lock file exists', async () => {
    expect(await readLock()).toBeNull();
  });

  it('writeLock creates a lock file with pid and port', async () => {
    await writeLock({ pid: 12345, port: 4173 });
    const lock = await readLock();
    expect(lock).toEqual({ pid: 12345, port: 4173 });
  });

  it('deleteLock removes the lock file', async () => {
    await writeLock({ pid: 12345, port: 4173 });
    await deleteLock();
    expect(await readLock()).toBeNull();
  });

  it('deleteLock is safe when file does not exist', async () => {
    await expect(deleteLock()).resolves.toBeUndefined();
  });

  it('isAlive returns true for current process pid', () => {
    expect(isAlive(process.pid)).toBe(true);
  });

  it('isAlive returns false for a non-existent pid', () => {
    expect(isAlive(99999999)).toBe(false);
  });
});
