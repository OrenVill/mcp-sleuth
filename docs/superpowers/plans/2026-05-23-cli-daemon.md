# CLI Daemon & Lock File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mcp-explorer` daemonizes on start, prevents duplicate instances with a friendly message, and supports `mcp-explorer stop`.

**Architecture:** The CLI re-spawns itself with an internal `--daemon` flag (`detached: true, stdio: 'ignore'`), unrefs the child, and polls `~/.mcp-explorer/daemon.json` until the daemon writes its `{pid, port}`. A `daemon-lock.js` root module owns all lock-file I/O.

**Tech Stack:** Node.js ESM, Vitest 4, no new npm dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `daemon-lock.js` | Create | Lock file read/write/delete + pid liveness check |
| `daemon-lock.test.js` | Create | Vitest unit tests for daemon-lock |
| `bin/mcp-explorer.js` | Modify | Stop subcommand, already-running check, re-spawn, daemon branch |
| `vite.config.ts` | Modify | Extend vitest `include` to pick up `*.test.js` at root |

---

## Task 1: Extend vitest to cover root-level JS tests

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Update the vitest include pattern**

In `vite.config.ts`, change:
```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
```
to:
```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '*.test.js'],
    passWithNoTests: true,
  },
```

- [ ] **Step 2: Verify tests still pass**

```bash
npm test
```
Expected: all existing tests pass, zero new failures.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: extend vitest include to cover root-level .test.js files"
```

---

## Task 2: Create daemon-lock.js (TDD)

**Files:**
- Create: `daemon-lock.js`
- Create: `daemon-lock.test.js`

- [ ] **Step 1: Write the failing tests**

Create `daemon-lock.test.js` at the repo root:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```
Expected: FAIL — `Cannot find module './daemon-lock.js'`

- [ ] **Step 3: Implement daemon-lock.js**

Create `daemon-lock.js` at the repo root:

```js
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```
Expected: 6 new tests PASS (readLock, writeLock, deleteLock, deleteLock safe, isAlive true, isAlive false).

- [ ] **Step 5: Commit**

```bash
git add daemon-lock.js daemon-lock.test.js
git commit -m "feat: add daemon-lock helpers (read/write/delete/isAlive)"
```

---

## Task 3: Rewrite bin/mcp-explorer.js with daemon support

**Files:**
- Modify: `bin/mcp-explorer.js`

The file is fully replaced below. Key changes:
- Import `daemon-lock.js`
- `mcp-explorer stop` subcommand at top
- Parent path: lock-check → re-spawn → poll → print started → exit
- Daemon path (`--daemon` flag): existing build+serve logic + `writeLock` after bind + cleanup handlers

- [ ] **Step 1: Replace bin/mcp-explorer.js with the new implementation**

```js
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readLock, writeLock, deleteLock, isAlive } from '../daemon-lock.js';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = resolve(
  pkgRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (codes, s) => (useColor ? `\x1b[${codes}m${s}\x1b[0m` : s);

function buildSilently() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(viteBin, ['build'], {
      cwd: pkgRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let out = '';
    child.stdout.on('data', (b) => (out += b.toString()));
    child.stderr.on('data', (b) => (out += b.toString()));
    child.on('exit', (code, signal) => {
      if (signal) rejectPromise(new BuildError(`terminated by ${signal}`, out));
      else if (code !== 0) rejectPromise(new BuildError(`exited with code ${code}`, out));
      else resolvePromise();
    });
    child.on('error', (err) => rejectPromise(new BuildError(err.message, out)));
  });
}

class BuildError extends Error {
  constructor(message, output) {
    super(message);
    this.output = output;
  }
}

function startSpinner(label) {
  if (!process.stdout.isTTY) {
    process.stdout.write(`  ${label}\n`);
    return () => {};
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write('\x1b[?25l');
  const draw = () => {
    process.stdout.write(`\r  ${paint('38;5;141', frames[i])} ${paint('2', label)}`);
    i = (i + 1) % frames.length;
  };
  draw();
  const handle = setInterval(draw, 80);
  return () => {
    clearInterval(handle);
    process.stdout.write('\r\x1b[2K\x1b[?25h');
  };
}

function openBrowser(url) {
  const isWSL = !!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP;
  let cmd;
  let cmdArgs;
  if (isWSL) {
    cmd = 'powershell.exe';
    const safeUrl = url.replace(/'/g, "''");
    cmdArgs = ['-NoProfile', '-Command', `Start-Process '${safeUrl}'`];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    cmdArgs = [url];
  } else if (process.platform === 'win32') {
    cmd = 'cmd.exe';
    cmdArgs = ['/c', 'start', '""', url];
  } else {
    cmd = 'xdg-open';
    cmdArgs = [url];
  }
  try {
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* ignore */
  }
}

const args = process.argv.slice(2);

// ── stop subcommand ──────────────────────────────────────────────────────────
if (args[0] === 'stop') {
  const lock = await readLock();
  if (!lock || !isAlive(lock.pid)) {
    if (lock) await deleteLock();
    console.log('mcp-explorer is not running');
    process.exit(0);
  }
  process.kill(lock.pid, 'SIGTERM');
  await deleteLock();
  console.log(paint('1;38;5;141', 'mcp-explorer') + ' stopped');
  process.exit(0);
}

// ── parent: check lock, re-spawn daemon, poll for start ─────────────────────
const isDaemon = args.includes('--daemon');

if (!isDaemon) {
  const lock = await readLock();
  if (lock && isAlive(lock.pid)) {
    console.log(
      paint('1;38;5;141', 'mcp-explorer') +
        ' is already running on ' +
        paint('36', `http://127.0.0.1:${lock.port}/`),
    );
    process.exit(0);
  }
  if (lock) await deleteLock(); // stale

  const binPath = fileURLToPath(import.meta.url);
  const passArgs = args.filter((a) => a !== '--daemon');
  const child = spawn(process.execPath, [binPath, '--daemon', ...passArgs], {
    detached: true,
    stdio: 'ignore',
    cwd: pkgRoot,
  });
  child.unref();

  // Poll for daemon.json (up to 5 s)
  const POLL_INTERVAL = 100;
  const POLL_TIMEOUT = 5000;
  let elapsed = 0;
  let startedLock = null;
  while (elapsed < POLL_TIMEOUT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    elapsed += POLL_INTERVAL;
    const l = await readLock();
    if (l?.pid && l?.port) {
      startedLock = l;
      break;
    }
  }

  if (!startedLock) {
    console.error(paint('31', 'mcp-explorer: timed out waiting for daemon to start'));
    process.exit(1);
  }

  console.log(
    paint('1;38;5;141', 'mcp-explorer') +
      ' started on ' +
      paint('36', `http://127.0.0.1:${startedLock.port}/`),
  );
  process.exit(0);
}

// ── daemon main ──────────────────────────────────────────────────────────────
process.on('SIGTERM', () => void deleteLock().finally(() => process.exit(0)));
process.on('SIGINT', () => void deleteLock().finally(() => process.exit(0)));

const hasPrebuiltDist = existsSync(resolve(pkgRoot, 'dist', 'index.html'));

if (!hasPrebuiltDist) {
  if (!existsSync(viteBin)) {
    process.stderr.write(
      `mcp-explorer: could not find vite at ${viteBin}.\nRun "npm install" inside ${pkgRoot} first.\n`,
    );
    process.exit(1);
  }

  const stopSpinner = startSpinner('building…');
  try {
    await buildSilently();
  } catch (err) {
    stopSpinner();
    process.stderr.write(
      `build failed (${err.message})\n` + (err.output ?? ''),
    );
    process.exit(1);
  }
  stopSpinner();
}

const daemonArgs = args.filter((a) => a !== '--daemon');
const noOpen = daemonArgs.includes('--no-open') || process.env.OPEN === '0';
const portArg = Number(daemonArgs.find((a) => /^\d+$/.test(a)));

const { start } = await import(resolve(pkgRoot, 'server.js'));

const BASE_PORT = Number.isFinite(portArg) ? portArg : Number(process.env.PORT ?? 4173);
const MAX_PORT_TRIES = 10;
let serverResult;
for (let attempt = 0; attempt < MAX_PORT_TRIES; attempt++) {
  const tryPort = BASE_PORT + attempt;
  try {
    serverResult = await start({ port: tryPort });
    break;
  } catch (err) {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES - 1) continue;
    process.stderr.write(`mcp-explorer: ${err.message}\n`);
    process.exit(1);
  }
}

const { port, url } = serverResult;
await writeLock({ pid: process.pid, port });

if (!noOpen) openBrowser(url);
```

- [ ] **Step 2: Run tests to make sure nothing broke**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 3: Manual smoke test — first start**

In a terminal:
```bash
node bin/mcp-explorer.js
```
Expected output (returns to prompt within ~1 s):
```
mcp-explorer started on http://127.0.0.1:4173/
```
Browser opens. Process returns control to the shell.

- [ ] **Step 4: Manual smoke test — already running**

```bash
node bin/mcp-explorer.js
```
Expected output (instant):
```
mcp-explorer is already running on http://127.0.0.1:4173/
```

- [ ] **Step 5: Manual smoke test — stop**

```bash
node bin/mcp-explorer.js stop
```
Expected:
```
mcp-explorer stopped
```
Running `node bin/mcp-explorer.js stop` again immediately after:
```
mcp-explorer is not running
```

- [ ] **Step 6: Verify lock file is gone after stop**

```bash
cat ~/.mcp-explorer/daemon.json
```
Expected: `cat: /home/<user>/.mcp-explorer/daemon.json: No such file or directory`

- [ ] **Step 7: Commit**

```bash
git add bin/mcp-explorer.js
git commit -m "feat: daemonize CLI with lock file and stop subcommand"
```
