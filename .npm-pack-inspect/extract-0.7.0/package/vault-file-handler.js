/**
 * HTTP handler for encrypted vault JSON stored on disk (npm / node server + Vite dev).
 * Default path: ~/.mcp-explorer/vault.json
 * Override directory: MCP_EXPLORER_DATA_DIR=/path/to/dir (file will be vault.json inside it).
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const VAULT_STORAGE_URL_PATH = '/__vault_storage';

/** Normalize URL pathname so `/__vault_storage` matches `/__vault_storage/`. */
export function isVaultStorageRequest(url) {
  if (!url || typeof url !== 'string') return false;
  const pathOnly = url.split('?')[0].replace(/\/+$/, '') || '/';
  return pathOnly === VAULT_STORAGE_URL_PATH;
}

export function getVaultFilePath() {
  const dir =
    process.env.MCP_EXPLORER_DATA_DIR ?? join(homedir(), '.mcp-explorer');
  return join(dir, 'vault.json');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function handleVaultStorage(req, res) {
  const filePath = getVaultFilePath();
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    try {
      const data = await readFile(filePath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(data);
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
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, body, 'utf8');
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

  res.writeHead(405, { Allow: 'GET, PUT, DELETE', 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method Not Allowed');
}
