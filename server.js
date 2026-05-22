#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';
import { handleMcpProxy, PROXY_PATH } from './proxy.js';
import { handleVaultStorage, isVaultStorageRequest } from './vault-file-handler.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(here, 'dist');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (codes, s) => (useColor ? `\x1b[${codes}m${s}\x1b[0m` : s);
export function readyLine(host, port) {
  const name = c('1;38;5;141', 'mcp-explorer'); // bold violet
  const arrow = c('2', '➜'); // dim
  const url = c('36', `http://${host}:${port}/`); // cyan
  return `  ${name}  ${arrow}  ${url}`;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function start({
  root = defaultRoot,
  port = Number(process.env.PORT ?? 4173),
  host = process.env.HOST ?? '127.0.0.1',
} = {}) {
  if (!existsSync(root)) {
    throw new Error(
      `mcp-explorer: ${root} does not exist. Run "npm run build" (or "mcp-explorer") first.`,
    );
  }

  async function resolveFile(urlPath) {
    const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
    const filePath = resolve(join(root, clean));
    if (filePath !== root && !filePath.startsWith(root + '/')) return null;
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) {
        const idx = join(filePath, 'index.html');
        if ((await stat(idx)).isFile()) return idx;
      } else if (s.isFile()) {
        return filePath;
      }
    } catch {
      /* not found */
    }
    return null;
  }

  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    if (url === PROXY_PATH || url.startsWith(PROXY_PATH + '?')) {
      handleMcpProxy(req, res);
      return;
    }
    if (isVaultStorageRequest(url)) {
      handleVaultStorage(req, res).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end(err instanceof Error ? err.message : String(err));
      });
      return;
    }
    let file = await resolveFile(url);

    // SPA fallback: serve index.html for unknown non-asset routes.
    if (!file && !extname(url)) file = join(root, 'index.html');

    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': file.endsWith('index.html')
          ? 'no-cache'
          : 'public, max-age=31536000, immutable',
      });
      res.end(data);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        rejectPromise(Object.assign(new Error(`port ${port} is already in use`), { code: 'EADDRINUSE', port }));
      } else {
        rejectPromise(err);
      }
    });
    server.listen(port, host, () => {
      console.log(readyLine(host, port));
      resolvePromise({ server, host, port, url: `http://${host}:${port}/` });
    });
  });
}

// Auto-start only when this file is executed directly (e.g. `node server.js`).
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const portArg = Number(process.argv[2]);
  start({ port: Number.isFinite(portArg) ? portArg : undefined }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
