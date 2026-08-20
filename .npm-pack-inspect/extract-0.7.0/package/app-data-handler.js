/**
 * HTTP handler for gzip-compressed app data (bookmarks + history) stored on disk.
 * Default path: ~/.mcp-explorer/data.gz
 * Override directory: MCP_EXPLORER_DATA_DIR=/path/to/dir
 */
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const APP_DATA_URL_PATH = '/__app_data';

export function isAppDataRequest(url) {
  if (!url || typeof url !== 'string') return false;
  const pathOnly = url.split('?')[0].replace(/\/+$/, '') || '/';
  return pathOnly === APP_DATA_URL_PATH;
}

export function getAppDataFilePath() {
  const dir =
    process.env.MCP_EXPLORER_DATA_DIR ?? join(homedir(), '.mcp-explorer');
  return join(dir, 'data.gz');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function handleAppData(req, res) {
  const filePath = getAppDataFilePath();
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    try {
      const compressed = await readFile(filePath);
      const decompressed = await gunzipAsync(compressed);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(decompressed.toString('utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end('null');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(err.message);
      }
    }
    return;
  }

  if (method === 'PUT') {
    try {
      const body = await readBody(req);
      const compressed = await gzipAsync(Buffer.from(body, 'utf8'));
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, compressed);
      res.writeHead(204);
      res.end();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err.message);
    }
    return;
  }

  if (method === 'DELETE') {
    try {
      await unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(err.message);
        return;
      }
    }
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405, {
    Allow: 'GET, PUT, DELETE',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Method Not Allowed');
}
