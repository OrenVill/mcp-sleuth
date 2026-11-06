#!/usr/bin/env node
/**
 * Cross-platform `electron:dev` entry — `VAR=value cmd` in package.json
 * breaks on Windows CMD; this sets env in Node before spawning Electron.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainScript = join(repoRoot, 'electron', 'main.js');

const env = { ...process.env };
if (!env.MCP_DETECTIVE_DEV_URL && !env.MCP_SLEUTH_DEV_URL) {
  env.MCP_DETECTIVE_DEV_URL = 'http://localhost:5173';
}

const child = spawn(electronPath, [mainScript], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
