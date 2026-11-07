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
import { createInsecureFetch } from '../electron/mcp/insecureFetch.js';
import { chainHandler, isConnectionDeadError, isSessionLostError, isSseDisconnectSuspect } from '../electron/mcp/sessionRecovery.js';
import { clearReverseApprovalsForServer } from '../mcp/reverseBridge.js';
import { attachReverseRequestHandlers, DETECTIVE_CLIENT_CAPABILITIES } from '../mcp/reverseHandlers.js';

const SERVER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidServerId(id) {
  return typeof id === 'string' && SERVER_ID.test(id);
}

/**
 * Environment variables that make a process load code chosen by whoever set
 * them. The renderer names the command to spawn, which is already the strongest
 * thing this IPC channel does; without this list it could also turn a spawn of
 * a perfectly ordinary binary into arbitrary code execution.
 */
export const LOADER_ENV_VARS = [
  'LD_PRELOAD',
  'LD_AUDIT',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'NODE_OPTIONS',
  'BASH_ENV',
  'ENV',
  'PYTHONSTARTUP',
  'PERL5OPT',
];

const LOADER_ENV_SET = new Set(LOADER_ENV_VARS);

/**
 * Validate what the renderer asked to spawn.
 *
 * The renderer holds the decrypted vault, so the main process cannot
 * independently know which stdio servers the user actually configured — it
 * cannot allowlist the commands. What it can do is refuse a payload that is not
 * shaped like a server configuration at all, which is what a compromised
 * renderer would send. Throws with the offending field named.
 */
export function assertSpawnable(stdio, env) {
  if (!stdio || typeof stdio !== 'object') {
    throw new Error('stdio configuration must be an object');
  }
  if (typeof stdio.command !== 'string' || stdio.command.trim().length === 0) {
    throw new Error('stdio command must be a non-empty string');
  }
  if (stdio.args !== undefined) {
    if (!Array.isArray(stdio.args) || stdio.args.some((a) => typeof a !== 'string')) {
      throw new Error('stdio args must be an array of strings');
    }
  }
  if (stdio.cwd !== undefined && typeof stdio.cwd !== 'string') {
    throw new Error('stdio cwd must be a string');
  }
  if (env === undefined || env === null) return;
  if (typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('stdio environment must be an object');
  }
  for (const [key, value] of Object.entries(env)) {
    if (LOADER_ENV_SET.has(key.toUpperCase())) {
      throw new Error(`stdio environment may not set ${key}`);
    }
    if (typeof value !== 'string') {
      throw new Error(`stdio environment value for ${key} must be a string`);
    }
  }
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
  } else if (auth.method === 'oauth' && auth.oauth?.accessToken?.trim()) {
    headers.Authorization = `Bearer ${auth.oauth.accessToken.trim()}`;
  } else if (auth.method === 'api_key' && auth.apiKeyHeader?.trim() && auth.apiKeyValue?.trim()) {
    headers[auth.apiKeyHeader.trim()] = auth.apiKeyValue.trim();
  } else if (auth.method === 'basic') {
    headers.Authorization = `Basic ${utf8ToBase64(`${auth.basicUsername ?? ''}:${auth.basicPassword ?? ''}`)}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function createDefaultDeps() {
  return {
    createClient: () =>
      new Client({ name: 'mcp-detective', version: '0.1.0' }, { capabilities: DETECTIVE_CLIENT_CAPABILITIES }),
    createHttpTransport: (url, auth, options = {}) => {
      const parsed = new URL(url);
      const headers = headersFromAuth(auth);
      const init = {};
      if (headers) init.requestInit = { headers };
      if (options.allowSelfSigned) {
        // Only this server's transport gets it, and only for this hostname.
        // See insecureFetch.js for why net.fetch could not do the job.
        init.fetch = createInsecureFetch(parsed.hostname);
      }
      return new StreamableHTTPClientTransport(
        parsed,
        Object.keys(init).length > 0 ? init : undefined,
      );
    },
    createStdioTransport: (params) => new StdioClientTransport(params),
  };
}

export function createSessionManager(deps = createDefaultDeps()) {
  /** @type {Map<string, SessionRecord>} */
  const sessions = new Map();
  const toolsChangedListeners = new Set();
  const closedListeners = new Set();
  const reconnectedListeners = new Set();
  /** @type {Map<string, Promise<void>>} */
  const reconnectInflight = new Map();

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

  function emitClosed(serverId) {
    for (const listener of closedListeners) listener(serverId);
  }

  function emitReconnected(serverId) {
    for (const listener of reconnectedListeners) listener(serverId);
  }

  async function release(serverId, { emitClosedEvent = false } = {}) {
    const session = sessions.get(serverId);
    if (!session) return;
    clearReverseApprovalsForServer(serverId);
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
    if (emitClosedEvent) emitClosed(serverId);
  }

  function attachTransportHandlers(serverId, client, transport) {
    const handleClose = () => {
      if (sessions.get(serverId)?.transport === transport) {
        sessions.delete(serverId);
        emitClosed(serverId);
      }
    };

    transport.onclose = chainHandler(transport.onclose, handleClose);

    transport.onerror = chainHandler(transport.onerror, (err) => {
      if (sessions.get(serverId)?.transport !== transport) return;
      void (async () => {
        if (isSseDisconnectSuspect(err)) {
          try {
            await client.ping();
            return;
          } catch (pingErr) {
            if (!isSessionLostError(pingErr)) return;
          }
        } else if (!isSessionLostError(err)) {
          return;
        }
        // Wait for the next MCP call to run withSessionRecovery; do not loop here.
      })();
    });
  }

  async function open(serverId, transport, connectionMeta) {
    const client = deps.createClient();
    attachReverseRequestHandlers(client, serverId);
    await client.connect(transport);
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      for (const listener of toolsChangedListeners) listener(serverId);
    });
    attachTransportHandlers(serverId, client, transport);
    sessions.set(serverId, { client, transport, ...connectionMeta });
  }

  async function reconnect(serverId) {
    const inflight = reconnectInflight.get(serverId);
    if (inflight) return inflight;

    const job = (async () => {
      const record = sessions.get(serverId);
      if (!record) throw new Error(`Not connected to server "${serverId}"`);

      const saved = {
        kind: record.kind,
        url: record.url,
        auth: record.auth,
        options: record.options,
        stdio: record.stdio,
        env: record.env,
      };

      await release(serverId);

      try {
        if (saved.kind === 'http') {
          const transport = deps.createHttpTransport(saved.url, saved.auth, saved.options ?? {});
          await open(serverId, transport, saved);
        } else if (saved.kind === 'stdio') {
          assertSpawnable(saved.stdio, saved.env);
          await open(
            serverId,
            deps.createStdioTransport({
              command: saved.stdio.command,
              args: saved.stdio.args,
              cwd: saved.stdio.cwd,
              env: saved.env,
            }),
            saved,
          );
        } else {
          throw new Error('Unknown session kind');
        }
        emitReconnected(serverId);
      } catch (err) {
        await release(serverId);
        emitClosed(serverId);
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Server restarted and could not be reconnected: ${detail}`, { cause: err });
      }
    })().finally(() => {
      reconnectInflight.delete(serverId);
    });

    reconnectInflight.set(serverId, job);
    return job;
  }

  async function withSessionRecovery(serverId, fn) {
    try {
      return await fn();
    } catch (err) {
      if (isSessionLostError(err)) {
        await reconnect(serverId);
        return await fn();
      }
      if (isConnectionDeadError(err)) {
        await release(serverId);
        emitClosed(serverId);
      }
      throw err;
    }
  }

  return {
    async connect(serverId, url, auth, options) {
      requireId(serverId);
      await release(serverId);
      const meta = { kind: 'http', url, auth, options: options ?? {} };
      await open(serverId, deps.createHttpTransport(url, auth, options), meta);
    },

    async connectStdio(serverId, stdio, env) {
      requireId(serverId);
      assertSpawnable(stdio, env);
      await release(serverId);
      const meta = { kind: 'stdio', stdio, env };
      await open(
        serverId,
        deps.createStdioTransport({
          command: stdio.command,
          args: stdio.args,
          cwd: stdio.cwd,
          env,
        }),
        meta,
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
      return withSessionRecovery(serverId, async () => {
        const { client } = requireSession(serverId);
        const list = await client.listTools();
        return list.tools;
      });
    },

    async callTool(serverId, name, args) {
      return withSessionRecovery(serverId, async () => {
        const { client } = requireSession(serverId);
        return client.callTool({ name, arguments: args });
      });
    },

    async listResources(serverId) {
      return withSessionRecovery(serverId, async () => {
        const { client } = requireSession(serverId);
        const result = await client.listResources();
        return {
          resources: result.resources ?? [],
          resourceTemplates: result.resourceTemplates ?? [],
        };
      });
    },

    async readResource(serverId, uri) {
      return withSessionRecovery(serverId, async () => {
        const { client } = requireSession(serverId);
        const result = await client.readResource({ uri });
        return { contents: result.contents };
      });
    },

    async listPrompts(serverId) {
      return withSessionRecovery(serverId, async () => {
        const { client } = requireSession(serverId);
        const result = await client.listPrompts();
        return result.prompts ?? [];
      });
    },

    async getPrompt(serverId, name, args) {
      return withSessionRecovery(serverId, async () => {
        const { client } = requireSession(serverId);
        const result = await client.getPrompt({ name, arguments: args });
        return result.messages;
      });
    },

    onToolsChanged(listener) {
      toolsChangedListeners.add(listener);
      return () => toolsChangedListeners.delete(listener);
    },

    onClosed(listener) {
      closedListeners.add(listener);
      return () => closedListeners.delete(listener);
    },

    onReconnected(listener) {
      reconnectedListeners.add(listener);
      return () => reconnectedListeners.delete(listener);
    },

    async closeAll() {
      await Promise.all([...sessions.keys()].map((id) => release(id)));
    },

    // Test hooks — not part of the production IPC surface.
    _isSessionLostError: isSessionLostError,
    _reconnectInflight: reconnectInflight,
  };
}

/**
 * @typedef {'http' | 'stdio'} SessionKind
 * @typedef {{
 *   client: import('@modelcontextprotocol/sdk/client/index.js').Client,
 *   transport: import('@modelcontextprotocol/sdk/shared/transport.js').Transport,
 *   kind: SessionKind,
 *   url?: string,
 *   auth?: unknown,
 *   options?: { allowSelfSigned?: boolean },
 *   stdio?: { command: string, args?: string[], cwd?: string },
 *   env?: Record<string, string>,
 * }} SessionRecord
 */
