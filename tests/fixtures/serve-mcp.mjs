/**
 * Shared streamable-HTTP plumbing for the test fixture servers.
 *
 * Stateless mode (`sessionIdGenerator: undefined`): a fresh server and transport
 * per request, so there is no session state to leak between specs.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * @param {() => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} buildServer
 * @param {{ port: number, host?: string, label: string, tls?: {key: Buffer, cert: Buffer} }} options
 */
export function serveMcp(buildServer, { port, host = '127.0.0.1', label, tls }) {
  const handler = async (req, res) => {
    // Permissive CORS so the explorer works with its local proxy on or off.
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if ((req.url ?? '/').split('?')[0] !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(err instanceof Error ? err.message : String(err));
    }
  };

  const httpServer = tls ? createTlsServer(tls, handler) : createServer(handler);
  const scheme = tls ? 'https' : 'http';

  httpServer.listen(port, host, () => {
    console.log(`${label} listening on ${scheme}://${host}:${port}/mcp`);
  });

  return httpServer;
}

/**
 * Stateful Streamable HTTP: one transport keeps session ids in memory until reset.
 * POST /__restart drops all sessions (simulates an MCP server process restart).
 *
 * @param {() => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} buildServer
 * @param {{ port: number, host?: string, label: string }} options
 */
export function serveStatefulMcp(buildServer, { port, host = '127.0.0.1', label }) {
  let mcpServer;
  /** @type {import('@modelcontextprotocol/sdk/server/streamableHttp.js').StreamableHTTPServerTransport | null} */
  let transport = null;
  let offline = false;

  async function resetSessions() {
    try {
      await transport?.close();
    } catch {
      /* ignore */
    }
    try {
      await mcpServer?.close();
    } catch {
      /* ignore */
    }
    mcpServer = buildServer();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });
    await mcpServer.connect(transport);
  }

  const handler = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const path = (req.url ?? '/').split('?')[0];

    if (path === '/__restart' && req.method === 'POST') {
      await resetSessions();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    if (path === '/__offline' && req.method === 'POST') {
      offline = true;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    if (path === '/__online' && req.method === 'POST') {
      offline = false;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    if (path !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    if (offline) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('offline');
      return;
    }

    const body = req.method === 'POST' ? await readJsonBody(req) : undefined;

    try {
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(err instanceof Error ? err.message : String(err));
    }
  };

  const httpServer = createServer(handler);

  void resetSessions().then(() => {
    httpServer.listen(port, host, () => {
      console.log(`${label} (stateful) listening on http://${host}:${port}/mcp`);
    });
  });

  return httpServer;
}
