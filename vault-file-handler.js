/**
 * HTTP handler for encrypted vault JSON stored on disk (npm / node server + Vite dev).
 * Default path: ~/.mcp-sleuth/vault.json
 * Override directory: MCP_SLEUTH_DATA_DIR=/path/to/dir (file will be vault.json inside it).
 */
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getDataDir, writePrivateFile } from './data-dir.js';

/**
 * A raw fs error names the data directory and therefore the account it belongs
 * to. That belongs in the operator's log, not in a response body.
 */
function fail(res, err) {
  console.error('[mcp-sleuth] vault storage:', err instanceof Error ? err.message : String(err));
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  res.end('Internal Server Error');
}

export const VAULT_STORAGE_URL_PATH = '/__vault_storage';

/** Normalize URL pathname so `/__vault_storage` matches `/__vault_storage/`. */
export function isVaultStorageRequest(url) {
  if (!url || typeof url !== 'string') return false;
  const pathOnly = url.split('?')[0].replace(/\/+$/, '') || '/';
  return pathOnly === VAULT_STORAGE_URL_PATH;
}

export function getVaultFilePath() {
  return join(getDataDir(), 'vault.json');
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
        fail(res, err);
      }
    }
    return;
  }

  if (method === 'PUT') {
    try {
      const body = await readBody(req);
      await writePrivateFile(filePath, body);
      res.writeHead(204);
      res.end();
    } catch (err) {
      fail(res, err);
    }
    return;
  }

  if (method === 'DELETE') {
    try {
      await unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        fail(res, err);
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
