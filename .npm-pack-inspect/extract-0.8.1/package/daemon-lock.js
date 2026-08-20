import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function getLockPath() {
  const dir = process.env.MCP_EXPLORER_DATA_DIR ?? join(homedir(), '.mcp-explorer');
  return join(dir, 'daemon.json');
}

export async function readLock() {
  try {
    const raw = await readFile(getLockPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeLock({ pid, port }) {
  const lockPath = getLockPath();
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, JSON.stringify({ pid, port }), 'utf8');
}

export async function deleteLock() {
  try {
    await unlink(getLockPath());
  } catch {
    // safe if missing
  }
}

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
