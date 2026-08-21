/**
 * Shared streamable-HTTP plumbing for the test fixture servers.
 *
 * Stateless mode (`sessionIdGenerator: undefined`): a fresh server and transport
 * per request, so there is no session state to leak between specs.
 */
import { createServer } from 'node:http';
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
 * @param {{ port: number, host?: string, label: string }} options
 */
export function serveMcp(buildServer, { port, host = '127.0.0.1', label }) {
  const httpServer = createServer(async (req, res) => {
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
  });

  httpServer.listen(port, host, () => {
    console.log(`${label} listening on http://${host}:${port}/mcp`);
  });

  return httpServer;
}
