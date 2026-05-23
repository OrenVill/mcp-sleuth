#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

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
  process.stdout.write('\x1b[?25l'); // hide cursor
  const draw = () => {
    process.stdout.write(`\r  ${paint('38;5;141', frames[i])} ${paint('2', label)}`);
    i = (i + 1) % frames.length;
  };
  draw();
  const handle = setInterval(draw, 80);
  return () => {
    clearInterval(handle);
    process.stdout.write('\r\x1b[2K\x1b[?25h'); // clear line, show cursor
  };
}

const hasPrebuiltDist = existsSync(resolve(pkgRoot, 'dist', 'index.html'));

if (!hasPrebuiltDist) {
  if (!existsSync(viteBin)) {
    console.error(
      paint('31', `mcp-explorer: could not find vite at ${viteBin}.`) +
        `\nRun "npm install" inside ${pkgRoot} first.`,
    );
    process.exit(1);
  }

  const stop = startSpinner('building…');
  const cleanExit = () => {
    stop();
    process.exit(130);
  };
  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);

  try {
    await buildSilently();
  } catch (err) {
    stop();
    console.error(paint('31;1', '✗ build failed') + paint('2', ` (${err.message})`));
    if (err.output) process.stderr.write(err.output);
    process.exit(1);
  }

  stop();
}

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open') || process.env.OPEN === '0';
const portArg = Number(args.find((a) => /^\d+$/.test(a)));

const { start } = await import(resolve(pkgRoot, 'server.js'));

const BASE_PORT = Number.isFinite(portArg) ? portArg : Number(process.env.PORT ?? 4173);
const MAX_PORT_TRIES = 10;
let url;
for (let attempt = 0; attempt < MAX_PORT_TRIES; attempt++) {
  const tryPort = BASE_PORT + attempt;
  try {
    ({ url } = await start({ port: tryPort }));
    break;
  } catch (err) {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES - 1) {
      process.stderr.write(
        paint('2', `  port ${tryPort} in use, trying ${tryPort + 1}…\n`),
      );
      continue;
    }
    console.error(paint('31', `mcp-explorer: ${err.message}`));
    process.exit(1);
  }
}
if (!noOpen) openBrowser(url);

function openBrowser(url) {
  const isWSL =
    !!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP;
  let cmd;
  let cmdArgs;
  if (isWSL) {
    // PowerShell's Start-Process focuses the window; explorer.exe does not.
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
    child.on('error', () => {
      /* missing opener: silent — user already has the URL */
    });
    child.unref();
  } catch {
    /* ignore */
  }
}
