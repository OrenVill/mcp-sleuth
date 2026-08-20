/**
 * Owns the live MCP client sessions inside the Electron main process.
 *
 * Transport and client construction are injected so this module can be unit
 * tested without opening sockets or spawning subprocesses. `createDefaultDeps()`
 * supplies the real SDK wiring.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

const SERVER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidServerId(id) {
  return typeof id === 'string' && SERVER_ID.test(id);
}

/** UTF-8 safe Base64 for HTTP Basic credentials beyond Latin-1. */
function utf8ToBase64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

/** Mirrors requestInitFromAuth in the browser host, but for Node fetch. */
export function headersFromAuth(auth) {
  if (!auth || auth.method === 'none') return undefined;
  const headers = {};

  if (auth.method === 'bearer' && auth.bearerToken?.trim()) {
    headers.Authorization = `Bearer ${auth.bearerToken.trim()}`;
  } else if (auth.method === 'api_key' && auth.apiKeyHeader?.trim() && auth.apiKeyValue?.trim()) {
    headers[auth.apiKeyHeader.trim()] = auth.apiKeyValue.trim();
  } else if (auth.method === 'basic') {
    headers.Authorization = `Basic ${utf8ToBase64(`${auth.basicUsername ?? ''}:${auth.basicPassword ?? ''}`)}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function createDefaultDeps() {
  return {
    createClient: () => new Client({ name: 'mcp-explorer', version: '0.1.0' }, { capabilities: {} }),
    createHttpTransport: (url, auth) => {
      const headers = headersFromAuth(auth);
      return new StreamableHTTPClientTransport(
        new URL(url),
        headers ? { requestInit: { headers } } : undefined,
      );
    },
    createStdioTransport: (params) => new StdioClientTransport(params),
  };
}

export function createSessionManager(deps = createDefaultDeps()) {
  /** @type {Map<string, {client: any, transport: any}>} */
  const sessions = new Map();
  const toolsChangedListeners = new Set();
  const closedListeners = new Set();

  function requireId(serverId) {
    if (!isValidServerId(serverId)) {
      throw new Error(`Invalid server id: ${String(serverId)}`);
    }
  }

  function requireSession(serverId) {
    const session = sessions.get(serverId);
    if (!session) throw new Error(`Not connected to server "${serverId}"`);
    return session;
  }

  async function release(serverId) {
    const session = sessions.get(serverId);
    if (!session) return;
    sessions.delete(serverId);
    try {
      await session.client.close();
    } catch {
      /* ignore */
    }
    try {
      await session.transport.close();
    } catch {
      /* ignore */
    }
  }

  async function open(serverId, transport) {
    const client = deps.createClient();
    await client.connect(transport);
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      for (const listener of toolsChangedListeners) listener(serverId);
    });
    // A transport can drop without the renderer asking (server restart, stdio child
    // exit). Guard on identity so a stale transport cannot evict a newer session.
    transport.onclose = () => {
      if (sessions.get(serverId)?.transport === transport) {
        sessions.delete(serverId);
        for (const listener of closedListeners) listener(serverId);
      }
    };
    sessions.set(serverId, { client, transport });
  }

  return {
    async connect(serverId, url, auth) {
      requireId(serverId);
      await release(serverId);
      await open(serverId, deps.createHttpTransport(url, auth));
    },

    async connectStdio(serverId, stdio, env) {
      requireId(serverId);
      await release(serverId);
      await open(
        serverId,
        deps.createStdioTransport({
          command: stdio.command,
          args: stdio.args,
          cwd: stdio.cwd,
          env,
        }),
      );
    },

    async disconnect(serverId) {
      requireId(serverId);
      await release(serverId);
    },

    isConnected(serverId) {
      return sessions.has(serverId);
    },

    async listTools(serverId) {
      const { client } = requireSession(serverId);
      const list = await client.listTools();
      return list.tools;
    },

    async callTool(serverId, name, args) {
      const { client } = requireSession(serverId);
      return client.callTool({ name, arguments: args });
    },

    async listResources(serverId) {
      const { client } = requireSession(serverId);
      const result = await client.listResources();
      return {
        resources: result.resources ?? [],
        resourceTemplates: result.resourceTemplates ?? [],
      };
    },

    async readResource(serverId, uri) {
      const { client } = requireSession(serverId);
      const result = await client.readResource({ uri });
      return { contents: result.contents };
    },

    async listPrompts(serverId) {
      const { client } = requireSession(serverId);
      const result = await client.listPrompts();
      return result.prompts ?? [];
    },

    async getPrompt(serverId, name, args) {
      const { client } = requireSession(serverId);
      const result = await client.getPrompt({ name, arguments: args });
      return result.messages;
    },

    onToolsChanged(listener) {
      toolsChangedListeners.add(listener);
      return () => toolsChangedListeners.delete(listener);
    },

    onClosed(listener) {
      closedListeners.add(listener);
      return () => closedListeners.delete(listener);
    },

    async closeAll() {
      await Promise.all([...sessions.keys()].map((id) => release(id)));
    },
  };
}
