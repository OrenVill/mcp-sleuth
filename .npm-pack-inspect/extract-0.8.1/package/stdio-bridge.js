import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';

export const STDIO_BRIDGE_PREFIX = '/__mcp_stdio';
const ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_BODY_BYTES = 1_048_576;
export const sessions = new Map();

/** Reject non-loopback clients — stdio bridge can spawn arbitrary processes. */
export function isLoopbackRequest(req) {
  const remote = req.socket?.remoteAddress;
  if (!remote) {
    // Some local transports omit remoteAddress; allow only when Host is loopback.
    const host = req.headers?.host?.split(':')[0] ?? '';
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }
  return (
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote === '::ffff:127.0.0.1'
  );
}

export function isValidServerId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export function parseStdioPath(urlPath) {
  const clean = urlPath.split('?')[0];
  if (!clean.startsWith(STDIO_BRIDGE_PREFIX + '/')) return null;
  const rest = clean.slice(STDIO_BRIDGE_PREFIX.length + 1);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1) return { serverId: decodeURIComponent(parts[0]), action: 'stop' };
  if (parts.length === 2) {
    const serverId = decodeURIComponent(parts[0]);
    const tail = parts[1];
    if (tail === 'start') return { serverId, action: 'start' };
    if (tail === 'mcp') return { serverId, action: 'mcp' };
  }
  return null;
}

function mergeEnv(overrides) {
  return { ...getDefaultEnvironment(), ...(overrides ?? {}) };
}

async function closeQuietly(resource) {
  if (!resource || typeof resource.close !== 'function') return;
  try {
    await resource.close();
  } catch {
    // Best-effort cleanup.
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('Body too large');
      err.code = 'BODY_TOO_LARGE';
      throw err;
    }
    chunks.push(data);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('Invalid JSON body');
    err.code = 'INVALID_JSON';
    throw err;
  }
}

export function createFacadeServer(stdioClient) {
  const capabilities = stdioClient.getServerCapabilities() ?? {};
  const facade = new Server(
    { name: 'mcp-explorer-stdio-bridge', version: '0.1.0' },
    { capabilities },
  );

  if (capabilities.tools) {
    facade.setRequestHandler(ListToolsRequestSchema, async (req) => {
      return stdioClient.listTools(req.params);
    });
    facade.setRequestHandler(CallToolRequestSchema, async (req) => {
      return stdioClient.callTool(req.params);
    });
    stdioClient.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      try {
        await facade.sendToolListChanged();
      } catch {
        // Facade may not have active subscribers; ignore.
      }
    });
  }

  if (capabilities.resources) {
    facade.setRequestHandler(ListResourcesRequestSchema, async (req) => {
      return stdioClient.listResources(req.params);
    });
    facade.setRequestHandler(ReadResourceRequestSchema, async (req) => {
      return stdioClient.readResource(req.params);
    });
  }

  if (capabilities.prompts) {
    facade.setRequestHandler(ListPromptsRequestSchema, async (req) => {
      return stdioClient.listPrompts(req.params);
    });
    facade.setRequestHandler(GetPromptRequestSchema, async (req) => {
      return stdioClient.getPrompt(req.params);
    });
  }

  return facade;
}

export async function stopSession(serverId) {
  const session = sessions.get(serverId);
  if (!session) return;

  sessions.delete(serverId);
  await closeQuietly(session.httpTransport);
  await closeQuietly(session.facade);
  await closeQuietly(session.stdioClient);
  await closeQuietly(session.stdioTransport);
}

export async function startSession(serverId, { command, args, cwd, env }) {
  await stopSession(serverId);

  const stdioTransport = new StdioClientTransport({
    command,
    args: Array.isArray(args) ? args : [],
    cwd,
    env: mergeEnv(env),
    stderr: 'pipe',
  });
  const stdioClient = new Client({ name: 'mcp-explorer', version: '0.1.0' }, { capabilities: {} });

  let facade;
  let httpTransport;
  try {
    await stdioClient.connect(stdioTransport);
    facade = createFacadeServer(stdioClient);
    httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await facade.connect(httpTransport);

    const session = {
      stdioTransport,
      stdioClient,
      facade,
      httpTransport,
      startedAt: Date.now(),
      dead: false,
    };
    stdioTransport.onclose = () => {
      session.dead = true;
      if (sessions.get(serverId) === session) {
        sessions.delete(serverId);
      }
    };
    sessions.set(serverId, session);
    return session;
  } catch (err) {
    await closeQuietly(httpTransport);
    await closeQuietly(facade);
    await closeQuietly(stdioClient);
    await closeQuietly(stdioTransport);
    throw err;
  }
}

export async function handleStdioBridge(req, res) {
  if (!isLoopbackRequest(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Stdio bridge is only available on localhost');
    return;
  }

  const parsed = new URL(req.url ?? '/', 'http://placeholder.invalid');
  const route = parseStdioPath(parsed.pathname);
  if (!route || !isValidServerId(route.serverId)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  if (route.action === 'start' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || typeof body.command !== 'string' || body.command.length === 0) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid start payload');
        return;
      }

      await startSession(route.serverId, {
        command: body.command,
        args: body.args,
        cwd: body.cwd,
        env: body.env,
      });
      res.writeHead(204);
      res.end();
      return;
    } catch (err) {
      if (err && typeof err === 'object' && err.code === 'BODY_TOO_LARGE') {
        res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Body too large');
        return;
      }
      if (err && typeof err === 'object' && err.code === 'INVALID_JSON') {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid JSON body');
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to start stdio session';
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(message);
      return;
    }
  }

  if (route.action === 'stop' && req.method === 'DELETE') {
    await stopSession(route.serverId);
    res.writeHead(204);
    res.end();
    return;
  }

  if (route.action === 'mcp' && (req.method === 'GET' || req.method === 'POST')) {
    const session = sessions.get(route.serverId);
    if (!session || session.dead) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(session?.dead ? 'Stdio process exited' : 'Stdio session not started');
      return;
    }
    try {
      await session.httpTransport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        const message = err instanceof Error ? err.message : 'Failed to handle MCP request';
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
      }
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method Not Allowed');
}
