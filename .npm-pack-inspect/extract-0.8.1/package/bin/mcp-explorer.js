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
  const STOP_TIMEOUT = 3000;
  const STOP_INTERVAL = 50;
  let waited = 0;
  while (isAlive(lock.pid) && waited < STOP_TIMEOUT) {
    await new Promise((r) => setTimeout(r, STOP_INTERVAL));
    waited += STOP_INTERVAL;
  }
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
