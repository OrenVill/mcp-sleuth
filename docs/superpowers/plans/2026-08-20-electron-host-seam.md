# Electron Host Seam (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `Host` abstraction that owns MCP transport and file saving, move today's browser implementation behind it, and leave observable behaviour unchanged.

**Architecture:** `src/lib/mcpClient.ts` keeps its exact public API and every `traceProtocolCall` wrapper, but stops constructing the MCP SDK client. The SDK code moves verbatim into `src/lib/host/browser/mcpBrowser.ts`. A `getHost()` registry returns the browser host today; Phase 2 adds the Electron host behind the same interface. Because the trace seam sits *above* the host seam, `protocolTrace.ts`, `useProtocolTraces.ts`, and `ProtocolInspectorPanel.tsx` are untouched.

**Tech Stack:** TypeScript 6, React 19, Vitest (node environment), `@modelcontextprotocol/sdk`, Playwright.

**Acceptance criterion:** all 23 specs in `tests/release/` pass **unmodified**. If a release spec needs editing, the seam has leaked and the task is wrong.

**Source spec:** `docs/superpowers/specs/2026-08-20-electron-desktop-app-design.md`

---

## Background for someone with no context

MCP Explorer is a Vite + React browser app that talks to MCP servers. Today
`src/lib/mcpClient.ts` does two jobs at once: it owns the `@modelcontextprotocol/sdk`
`Client` objects (a module-level `Map` keyed by `serverId`), and it wraps every call in
`traceProtocolCall` so the Protocol Inspector can show a timeline.

We are splitting those two jobs. After this plan, `mcpClient.ts` only does tracing and
delegates the transport work to a `Host`. That makes it possible, in Phase 2, to swap in
an Electron implementation where the SDK runs in the Electron main process.

Only four files import `mcpClient`, and none of them change in this plan:
`src/App.tsx`, `src/components/ToolDetail.tsx`, `src/components/ResourceDetail.tsx`,
`src/components/PromptDetail.tsx`.

**Vitest runs in the `node` environment** (`vite.config.ts:109`). There is no `window`
or `document` global in tests unless a test creates a stub. Keep that in mind: any test
touching `document.createElement` must stub it explicitly.

---

## File Structure

**Created:**

| File | Responsibility |
|------|---------------|
| `src/lib/host/types.ts` | The `McpHost`, `FilesHost`, and `Host` interfaces. Types only, no runtime code. |
| `src/lib/host/index.ts` | `getHost()` registry + `setHost()` / `resetHost()` test seam. Defaults to the browser host. |
| `src/lib/host/browser/mcpBrowser.ts` | Today's SDK-in-renderer code, moved. Owns the `Client`/transport maps. |
| `src/lib/host/browser/filesBrowser.ts` | Blob-and-anchor download, moved out of `export.ts`. |
| `src/lib/host/browser/index.ts` | Assembles `browserHost: Host` from the two modules above. |
| `src/lib/host/index.test.ts` | Registry behaviour. |
| `src/lib/host/browser/mcpBrowser.test.ts` | The SDK-level tests moved from `mcpClient.test.ts`. |
| `src/lib/host/browser/filesBrowser.test.ts` | Download helper behaviour. |

**Modified:**

| File | Change |
|------|--------|
| `src/lib/mcpClient.ts` | Rewritten to delegate to `getHost().mcp`, keeping the public API and all tracing. |
| `src/lib/mcpClient.test.ts` | Rewritten against a fake host; asserts tracing still happens. |
| `src/lib/export.ts:190` | `downloadFile` delegates to `getHost().files.saveFile`. |
| `src/components/ObservationJournalPanel.tsx:125-135` | Uses `downloadFile` instead of its own inline duplicate. |

**Not touched (deliberately):** `src/lib/protocolTrace.ts`, `src/components/useProtocolTraces.ts`, `src/components/ProtocolInspectorPanel.tsx`, `proxy.js`, `stdio-bridge.js`, `server.js`, and every file in `tests/release/`.

---

## Two intentional behaviour changes

Both are deliberate. Do not "fix" them back.

1. **Stdio `initialize` trace params change.** Today a stdio connection traces
   `initialize` with `{ url: '/__mcp_stdio/<id>/mcp', proxyThroughLocal: false }`. The
   bridge URL is a browser-only implementation detail that has no meaning in Electron,
   so it becomes `{ transport: 'stdio', command, args }`. No release spec asserts
   `initialize` params content — the specs only match on method names — so
   `tests/release/15-protocol-inspector.spec.ts` and `22-stdio-transport.spec.ts` still
   pass. Note `env` is deliberately excluded: it can hold secrets.

2. **`isConnected` stops being dead code.** It is currently exported from `mcpClient`
   and called nowhere. It becomes the guard that lets `mcpClient` throw
   `Not connected to server "<id>"` *before* opening a trace span, which is what
   preserves today's behaviour of not recording a trace event for calls to a
   disconnected server.

**Deferred to Phase 2:** the `secrets` capability group, and real feature detection in
`getHost()`. Defining a `SecretsHost` interface now would be speculative — the vault
service is already a clean module and there is no second implementation to vary against.
`getHost()` returns the browser host unconditionally in this phase; Phase 2 adds the
`window.mcpExplorer` check.

---

## Task 1: Host interfaces and registry

**Files:**
- Create: `src/lib/host/types.ts`
- Create: `src/lib/host/index.ts`
- Create: `src/lib/host/browser/index.ts`
- Test: `src/lib/host/index.test.ts`

- [ ] **Step 1: Write the interfaces**

Create `src/lib/host/types.ts`:

```ts
import type {
  PromptDef,
  PromptMessage,
  ResourceContent,
  ResourceEntry,
  ResourceTemplate,
  ServerAuth,
  ServerStdioConfig,
  ToolDef,
  ToolResult,
} from '../../types';

/**
 * Transport-level MCP operations. Implementations own the live client sessions.
 * Every method throws on failure; protocol tracing is applied by the caller
 * (`src/lib/mcpClient.ts`), never by an implementation.
 */
export interface McpHost {
  /** Open an HTTP session. Resolves once `initialize` has completed. */
  connect(
    serverId: string,
    url: string,
    auth: ServerAuth | undefined,
    proxyThroughLocal: boolean,
  ): Promise<void>;
  /** Open a session against a local stdio subprocess. */
  connectStdio(
    serverId: string,
    stdio: ServerStdioConfig,
    env: Record<string, string>,
  ): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  isConnected(serverId: string): boolean;
  listTools(serverId: string): Promise<ToolDef[]>;
  callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult>;
  listResources(serverId: string): Promise<{
    resources: ResourceEntry[];
    resourceTemplates: ResourceTemplate[];
  }>;
  readResource(serverId: string, uri: string): Promise<{ contents: ResourceContent[] }>;
  listPrompts(serverId: string): Promise<PromptDef[]>;
  getPrompt(
    serverId: string,
    name: string,
    args: Record<string, string>,
  ): Promise<PromptMessage[]>;
  /** Subscribe to `notifications/tools/list_changed`. Returns an unsubscribe fn. */
  onToolsChanged(serverId: string, handler: () => void): () => void;
}

/** Writing generated content out of the app. */
export interface FilesHost {
  saveFile(filename: string, content: string, mimeType: string): void;
}

export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
}
```

- [ ] **Step 2: Write the failing registry test**

Create `src/lib/host/index.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { getHost, resetHost, setHost } from './index';
import type { Host } from './types';

const fakeHost = { kind: 'electron' } as unknown as Host;

describe('getHost', () => {
  afterEach(() => {
    resetHost();
  });

  it('returns the browser host by default', () => {
    expect(getHost().kind).toBe('browser');
  });

  it('returns an explicitly registered host', () => {
    setHost(fakeHost);
    expect(getHost()).toBe(fakeHost);
  });

  it('restores the default after reset', () => {
    setHost(fakeHost);
    resetHost();
    expect(getHost().kind).toBe('browser');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/host/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"` (the module does not exist yet).

- [ ] **Step 4: Write the browser host shell**

Create `src/lib/host/browser/index.ts`. It references modules built in Tasks 2 and 4, so
create those two files as minimal stubs now and fill them in later:

```ts
import type { Host } from '../types';
import { browserMcpHost } from './mcpBrowser';
import { browserFilesHost } from './filesBrowser';

export const browserHost: Host = {
  kind: 'browser',
  mcp: browserMcpHost,
  files: browserFilesHost,
};
```

Create `src/lib/host/browser/mcpBrowser.ts` as a temporary stub — Task 2 replaces every
line of it:

```ts
import type { McpHost } from '../types';

const notImplemented = () => {
  throw new Error('browserMcpHost is not implemented yet');
};

export const browserMcpHost = new Proxy({} as McpHost, {
  get: () => notImplemented,
});
```

Create `src/lib/host/browser/filesBrowser.ts` as a temporary stub — Task 4 replaces it:

```ts
import type { FilesHost } from '../types';

export const browserFilesHost: FilesHost = {
  saveFile() {
    throw new Error('browserFilesHost is not implemented yet');
  },
};
```

- [ ] **Step 5: Write the registry**

Create `src/lib/host/index.ts`:

```ts
import { browserHost } from './browser';
import type { Host } from './types';

export type { FilesHost, Host, McpHost } from './types';

let current: Host | null = null;

/**
 * The active host. Phase 2 replaces the fallback with detection of the
 * Electron preload bridge (`window.mcpExplorer`).
 */
export function getHost(): Host {
  return current ?? browserHost;
}

/** Install a host explicitly. Used by tests and, in Phase 2, by app bootstrap. */
export function setHost(host: Host): void {
  current = host;
}

/** Drop any explicitly installed host and fall back to the browser host. */
export function resetHost(): void {
  current = null;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/lib/host/index.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/host/
git commit -m "feat(host): add Host interface and registry"
```

---

## Task 2: Browser MCP host

Move the SDK code out of `mcpClient.ts` into the browser host, preserving call ordering
exactly. `mcpClient.ts` is not touched in this task — it keeps working off its own copy
of the code until Task 3. That means the two files temporarily both hold SDK code; that
is expected and is resolved in Task 3.

**Files:**
- Modify (replace stub entirely): `src/lib/host/browser/mcpBrowser.ts`
- Create: `src/lib/host/browser/mcpBrowser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/host/browser/mcpBrowser.test.ts`. This is the SDK-level test moved from
`src/lib/mcpClient.test.ts`, retargeted at the host:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callOrder, startStdioSession, stopStdioSession, clientConnect } = vi.hoisted(() => {
  const callOrder: string[] = [];
  const startStdioSession = vi.fn(async () => {
    callOrder.push('startStdio');
  });
  const stopStdioSession = vi.fn(async () => undefined);
  const clientConnect = vi.fn(async () => {
    callOrder.push('clientConnect');
  });
  return { callOrder, startStdioSession, stopStdioSession, clientConnect };
});

vi.mock('../../stdioSession', () => ({
  startStdioSession,
  stopStdioSession,
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(function Client() {
    return {
      connect: clientConnect,
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'echo', description: 'Echo' }] }),
      close: vi.fn().mockResolvedValue(undefined),
      setNotificationHandler: vi.fn(),
    };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(function StreamableHTTPClientTransport() {
    return { close: vi.fn().mockResolvedValue(undefined) };
  }),
}));

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { stdioBridgeMcpUrl } from '../../stdioParse';
import { browserMcpHost, requestInitFromAuth, transportUrlForServer } from './mcpBrowser';

describe('transportUrlForServer', () => {
  it('routes through the local proxy by default', () => {
    const url = transportUrlForServer(
      'https://example.com/mcp?tenant=a',
      undefined,
      'http://127.0.0.1:4173',
    );

    expect(url.toString()).toBe(
      'http://127.0.0.1:4173/__mcp_proxy?target=https%3A%2F%2Fexample.com%2Fmcp%3Ftenant%3Da',
    );
  });

  it('uses the real server URL when local proxying is disabled', () => {
    const url = transportUrlForServer(
      'https://example.com/mcp',
      false,
      'http://127.0.0.1:4173',
    );

    expect(url.toString()).toBe('https://example.com/mcp');
  });
});

describe('requestInitFromAuth', () => {
  it('returns undefined when auth is absent or disabled', () => {
    expect(requestInitFromAuth(undefined)).toBeUndefined();
    expect(requestInitFromAuth({ method: 'none' })).toBeUndefined();
  });

  it('builds a bearer header', () => {
    const init = requestInitFromAuth({ method: 'bearer', bearerToken: 'abc' });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer abc');
  });
});

describe('browserMcpHost.connectStdio', () => {
  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
  });

  it('starts the bridge before connecting the HTTP client', async () => {
    const stdio = { command: 'node', args: ['server.mjs'] };
    await browserMcpHost.connectStdio('srv-1', stdio, { FOO: 'bar' });

    expect(startStdioSession).toHaveBeenCalledWith('srv-1', stdio, { FOO: 'bar' });
    expect(callOrder).toEqual(['startStdio', 'clientConnect']);

    const bridgeUrl = stdioBridgeMcpUrl('srv-1', 'http://127.0.0.1:4173');
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(new URL(bridgeUrl), undefined);
  });

  it('reports the session as connected afterwards', async () => {
    await browserMcpHost.connectStdio('srv-2', { command: 'node', args: [] }, {});
    expect(browserMcpHost.isConnected('srv-2')).toBe(true);
  });
});

describe('browserMcpHost.disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops the stdio session and clears connection state', async () => {
    await browserMcpHost.connectStdio('srv-3', { command: 'node', args: [] }, {});
    await browserMcpHost.disconnect('srv-3');

    expect(stopStdioSession).toHaveBeenCalledWith('srv-3');
    expect(browserMcpHost.isConnected('srv-3')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/host/browser/mcpBrowser.test.ts`
Expected: FAIL — `browserMcpHost is not implemented yet` from the Task 1 stub.

Note on `stdioBridgeMcpUrl('srv-1', 'http://127.0.0.1:4173')`: the second argument is the
base origin. `mcpBrowser.ts` calls it with one argument, which falls back to
`window.location.origin`. The test passes the origin explicitly because Vitest runs in the
`node` environment where `window` does not exist. Read `src/lib/stdioParse.ts:38` to
confirm the signature before writing the implementation.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib/host/browser/mcpBrowser.ts`:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  PromptDef,
  PromptMessage,
  ResourceContent,
  ResourceEntry,
  ResourceTemplate,
  ServerAuth,
  ServerStdioConfig,
  ToolDef,
  ToolResult,
} from '../../../types';
import { stdioBridgeMcpUrl } from '../../stdioParse';
import { startStdioSession, stopStdioSession } from '../../stdioSession';
import type { McpHost } from '../types';

const clients = new Map<string, Client>();
const transports = new Map<string, StreamableHTTPClientTransport>();

export function transportUrlForServer(
  target: string,
  proxyThroughLocal = true,
  baseOrigin?: string,
): URL {
  if (!proxyThroughLocal) return new URL(target);

  const base = baseOrigin ?? window.location.origin;
  return new URL(`/__mcp_proxy?target=${encodeURIComponent(target)}`, base);
}

/** UTF-8 safe Base64 (for HTTP Basic credentials beyond Latin-1). */
function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/** Builds RequestInit headers from persisted MCP auth (StreamableHTTPClientTransport merges these on every request). */
export function requestInitFromAuth(auth: ServerAuth | undefined): RequestInit | undefined {
  if (!auth || auth.method === 'none') return undefined;

  const headers = new Headers();

  switch (auth.method) {
    case 'bearer': {
      const t = auth.bearerToken?.trim();
      if (t) headers.set('Authorization', `Bearer ${t}`);
      break;
    }
    case 'api_key': {
      const name = auth.apiKeyHeader?.trim();
      const value = auth.apiKeyValue?.trim();
      if (name && value) headers.set(name, value);
      break;
    }
    case 'basic': {
      const u = auth.basicUsername ?? '';
      const p = auth.basicPassword ?? '';
      headers.set('Authorization', `Basic ${utf8ToBase64(`${u}:${p}`)}`);
      break;
    }
    default:
      break;
  }

  if ([...headers.keys()].length === 0) return undefined;
  return { headers };
}

async function releaseHttpConnection(serverId: string): Promise<void> {
  const client = clients.get(serverId);
  if (client) {
    try {
      await client.close();
    } catch {
      /* ignore close errors */
    }
    clients.delete(serverId);
  }
  const transport = transports.get(serverId);
  if (transport) {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    transports.delete(serverId);
  }
}

async function openHttpSession(
  serverId: string,
  url: string,
  auth: ServerAuth | undefined,
  proxyThroughLocal: boolean,
): Promise<void> {
  const requestInit = requestInitFromAuth(auth);
  const transport = new StreamableHTTPClientTransport(
    transportUrlForServer(url, proxyThroughLocal),
    requestInit ? { requestInit } : undefined,
  );
  const client = new Client({ name: 'mcp-explorer', version: '0.1.0' }, { capabilities: {} });

  await client.connect(transport);
  clients.set(serverId, client);
  transports.set(serverId, transport);
}

function requireClient(serverId: string): Client {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  return client;
}

export const browserMcpHost: McpHost = {
  async connect(serverId, url, auth, proxyThroughLocal) {
    await releaseHttpConnection(serverId);
    await stopStdioSession(serverId);
    await openHttpSession(serverId, url, auth, proxyThroughLocal);
  },

  async connectStdio(serverId, stdio: ServerStdioConfig, env) {
    await stopStdioSession(serverId);
    await startStdioSession(serverId, stdio, env);
    await releaseHttpConnection(serverId);
    await openHttpSession(serverId, stdioBridgeMcpUrl(serverId), undefined, false);
  },

  async disconnect(serverId) {
    await releaseHttpConnection(serverId);
    await stopStdioSession(serverId);
  },

  isConnected(serverId) {
    return clients.has(serverId);
  },

  async listTools(serverId) {
    const list = await requireClient(serverId).listTools();
    return list.tools as unknown as ToolDef[];
  },

  async callTool(serverId, name, args) {
    const result = await requireClient(serverId).callTool({ name, arguments: args });
    return result as unknown as ToolResult;
  },

  async listResources(serverId) {
    const result = await requireClient(serverId).listResources();
    return {
      resources: (result.resources ?? []) as unknown as ResourceEntry[],
      resourceTemplates: (result.resourceTemplates ?? []) as unknown as ResourceTemplate[],
    };
  },

  async readResource(serverId, uri) {
    const result = await requireClient(serverId).readResource({ uri });
    return { contents: result.contents as unknown as ResourceContent[] };
  },

  async listPrompts(serverId) {
    const result = await requireClient(serverId).listPrompts();
    return (result.prompts ?? []) as unknown as PromptDef[];
  },

  async getPrompt(serverId, name, args) {
    const result = await requireClient(serverId).getPrompt({ name, arguments: args });
    return result.messages as unknown as PromptMessage[];
  },

  onToolsChanged(serverId, handler) {
    const client = clients.get(serverId);
    if (!client) return () => {};
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      handler();
    });
    return () => {
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {});
    };
  },
};
```

Ordering note: `connect` releases the HTTP connection then stops the stdio session;
`connectStdio` stops the stdio session, starts the new one, *then* releases the HTTP
connection. That asymmetry is intentional — it reproduces exactly what
`mcpClient.connect(..., preserveStdioSession)` does today. Do not "tidy" it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/host/browser/mcpBrowser.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/host/browser/mcpBrowser.ts src/lib/host/browser/mcpBrowser.test.ts
git commit -m "feat(host): implement browser MCP host"
```

---

## Task 3: Rewire mcpClient to delegate

**Files:**
- Modify (rewrite): `src/lib/mcpClient.ts`
- Modify (rewrite): `src/lib/mcpClient.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/lib/mcpClient.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProtocolTraces, getProtocolTraces } from './protocolTrace';
import { resetHost, setHost } from './host';
import type { Host, McpHost } from './host/types';

function makeFakeMcp(overrides: Partial<McpHost> = {}): McpHost {
  return {
    connect: vi.fn(async () => undefined),
    connectStdio: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    isConnected: vi.fn(() => true),
    listTools: vi.fn(async () => [{ name: 'echo', description: 'Echo' }]),
    callTool: vi.fn(async () => ({ content: [] })),
    listResources: vi.fn(async () => ({ resources: [], resourceTemplates: [] })),
    readResource: vi.fn(async () => ({ contents: [] })),
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(async () => []),
    onToolsChanged: vi.fn(() => () => {}),
    ...overrides,
  } as unknown as McpHost;
}

function install(mcp: McpHost): void {
  setHost({ kind: 'browser', mcp, files: { saveFile: vi.fn() } } as unknown as Host);
}

let mcp: McpHost;

beforeEach(() => {
  clearProtocolTraces();
  mcp = makeFakeMcp();
  install(mcp);
});

afterEach(() => {
  resetHost();
  vi.clearAllMocks();
});

describe('connect', () => {
  it('delegates to the host and returns its tool list', async () => {
    const { connect } = await import('./mcpClient');
    const tools = await connect('srv-1', 'https://example.com/mcp', undefined, true);

    expect(mcp.connect).toHaveBeenCalledWith('srv-1', 'https://example.com/mcp', undefined, true);
    expect(tools).toEqual([{ name: 'echo', description: 'Echo' }]);
  });

  it('traces initialize then tools/list', async () => {
    const { connect } = await import('./mcpClient');
    await connect('srv-1', 'https://example.com/mcp', undefined, true);

    const methods = getProtocolTraces().map((e) => e.method);
    expect(methods).toContain('initialize');
    expect(methods).toContain('tools/list');
  });
});

describe('connectStdio', () => {
  it('traces initialize with the command instead of a bridge URL', async () => {
    const { connectStdio } = await import('./mcpClient');
    await connectStdio('srv-1', { command: 'node', args: ['server.mjs'] }, { FOO: 'bar' });

    expect(mcp.connectStdio).toHaveBeenCalledWith(
      'srv-1',
      { command: 'node', args: ['server.mjs'] },
      { FOO: 'bar' },
    );

    const initialize = getProtocolTraces().find((e) => e.method === 'initialize');
    expect(initialize?.params).toEqual({
      transport: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    });
  });

  it('never puts env in the trace', async () => {
    const { connectStdio } = await import('./mcpClient');
    await connectStdio('srv-1', { command: 'node', args: [] }, { SECRET: 'hunter2' });

    expect(JSON.stringify(getProtocolTraces())).not.toContain('hunter2');
  });
});

describe('callTool', () => {
  it('traces tools/call', async () => {
    const { callTool } = await import('./mcpClient');
    await callTool('srv-1', 'echo', { text: 'hi' });

    expect(mcp.callTool).toHaveBeenCalledWith('srv-1', 'echo', { text: 'hi' });
    expect(getProtocolTraces().map((e) => e.method)).toContain('tools/call');
  });

  it('throws without tracing when the server is disconnected', async () => {
    mcp = makeFakeMcp({ isConnected: vi.fn(() => false) });
    install(mcp);
    const { callTool } = await import('./mcpClient');

    await expect(callTool('srv-1', 'echo', {})).rejects.toThrow(
      'Not connected to server "srv-1"',
    );
    expect(getProtocolTraces()).toHaveLength(0);
  });
});

describe('listResources', () => {
  it('renames resourceTemplates to templates', async () => {
    mcp = makeFakeMcp({
      listResources: vi.fn(async () => ({
        resources: [{ uri: 'file:///a', name: 'a' }],
        resourceTemplates: [{ uriTemplate: 'file:///{p}', name: 't' }],
      })),
    } as unknown as Partial<McpHost>);
    install(mcp);
    const { listResources } = await import('./mcpClient');

    const result = await listResources('srv-1');
    expect(result.resources).toHaveLength(1);
    expect(result.templates).toHaveLength(1);
  });
});

describe('refetchTools', () => {
  it('returns an empty array when disconnected', async () => {
    mcp = makeFakeMcp({ isConnected: vi.fn(() => false) });
    install(mcp);
    const { refetchTools } = await import('./mcpClient');

    expect(await refetchTools('srv-1')).toEqual([]);
  });
});

describe('disconnect', () => {
  it('delegates to the host', async () => {
    const { disconnect } = await import('./mcpClient');
    await disconnect('srv-1');
    expect(mcp.disconnect).toHaveBeenCalledWith('srv-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/mcpClient.test.ts`
Expected: FAIL — `mcp.connect` is never called, because `mcpClient.ts` still builds its
own SDK client. Several assertions fail; that is the point.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib/mcpClient.ts`:

```ts
import type {
  PromptDef,
  PromptMessage,
  ResourceContent,
  ResourceEntry,
  ResourceTemplate,
  ServerAuth,
  ServerStdioConfig,
  ToolDef,
  ToolResult,
} from '../types';
import { getHost } from './host';
import type { McpHost } from './host/types';
import { traceOptionalProtocolCall, traceProtocolCall } from './protocolTrace';

function mcp(): McpHost {
  return getHost().mcp;
}

/**
 * Throws before a trace span is opened, so calls to a disconnected server
 * do not appear in the Protocol Inspector.
 */
function requireConnected(host: McpHost, serverId: string): void {
  if (!host.isConnected(serverId)) {
    throw new Error(`Not connected to server "${serverId}"`);
  }
}

export async function connect(
  serverId: string,
  url: string,
  auth?: ServerAuth,
  proxyThroughLocal = true,
): Promise<ToolDef[]> {
  const host = mcp();
  await traceProtocolCall(
    { serverId, method: 'initialize', params: { url, proxyThroughLocal } },
    () => host.connect(serverId, url, auth, proxyThroughLocal),
  );
  return traceProtocolCall({ serverId, method: 'tools/list' }, () => host.listTools(serverId));
}

export async function connectStdio(
  serverId: string,
  stdio: ServerStdioConfig,
  stdioEnv: Record<string, string> = {},
): Promise<ToolDef[]> {
  const host = mcp();
  await traceProtocolCall(
    {
      serverId,
      method: 'initialize',
      // `env` is deliberately excluded: it can hold secrets.
      params: { transport: 'stdio', command: stdio.command, args: stdio.args },
    },
    () => host.connectStdio(serverId, stdio, stdioEnv),
  );
  return traceProtocolCall({ serverId, method: 'tools/list' }, () => host.listTools(serverId));
}

export async function disconnect(serverId: string): Promise<void> {
  await mcp().disconnect(serverId);
}

export async function callTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceProtocolCall(
    { serverId, method: 'tools/call', params: { name, arguments: args } },
    () => host.callTool(serverId, name, args),
  );
}

export function isConnected(serverId: string): boolean {
  return mcp().isConnected(serverId);
}

/**
 * Re-fetch the tool list for an already-connected server.
 * Returns an empty array if the server is disconnected.
 */
export async function refetchTools(serverId: string): Promise<ToolDef[]> {
  const host = mcp();
  if (!host.isConnected(serverId)) return [];
  return traceProtocolCall({ serverId, method: 'tools/list', params: { refresh: true } }, () =>
    host.listTools(serverId),
  );
}

/**
 * Subscribe to `notifications/tools/list_changed` for a connected server.
 * Returns an unsubscribe function. No-op if disconnected.
 */
export function onToolsChanged(serverId: string, handler: () => void): () => void {
  return mcp().onToolsChanged(serverId, handler);
}

export async function listResources(
  serverId: string,
): Promise<{ resources: ResourceEntry[]; templates: ResourceTemplate[] }> {
  const host = mcp();
  requireConnected(host, serverId);
  const result = await traceOptionalProtocolCall(
    { serverId, method: 'resources/list' },
    () => host.listResources(serverId),
    { resources: [], resourceTemplates: [] },
  );
  return { resources: result.resources, templates: result.resourceTemplates };
}

export async function readResource(
  serverId: string,
  uri: string,
): Promise<{ contents: ResourceContent[] }> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceProtocolCall({ serverId, method: 'resources/read', params: { uri } }, () =>
    host.readResource(serverId, uri),
  );
}

export async function listPrompts(serverId: string): Promise<PromptDef[]> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceOptionalProtocolCall(
    { serverId, method: 'prompts/list' },
    () => host.listPrompts(serverId),
    [] as PromptDef[],
  );
}

export async function getPrompt(
  serverId: string,
  name: string,
  args: Record<string, string>,
): Promise<PromptMessage[]> {
  const host = mcp();
  requireConnected(host, serverId);
  return traceProtocolCall(
    { serverId, method: 'prompts/get', params: { name, arguments: args } },
    () => host.getPrompt(serverId, name, args),
  );
}
```

Note the `listPrompts` fallback changed shape: the host returns `PromptDef[]` directly,
so the `traceOptionalProtocolCall` fallback is `[]`, not `{ prompts: [] }`. Read
`src/lib/protocolTrace.ts:144` to confirm the fallback parameter type before writing this.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/mcpClient.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify types and the whole unit suite**

Run: `npm run build && npm test`
Expected: build succeeds; the full Vitest suite passes.

`ServerStdioConfig` (`src/types.ts:5`) declares `command: string` and `args: string[]`
as required, so no optional-chaining or casting is needed in the trace params.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcpClient.ts src/lib/mcpClient.test.ts
git commit -m "refactor(mcp): delegate transport to the host, keep tracing in mcpClient"
```

---

## Task 4: Browser files host

**Files:**
- Modify (replace stub entirely): `src/lib/host/browser/filesBrowser.ts`
- Create: `src/lib/host/browser/filesBrowser.test.ts`
- Modify: `src/lib/export.ts:190`

- [ ] **Step 1: Write the failing test**

Create `src/lib/host/browser/filesBrowser.test.ts`. Vitest runs in the `node`
environment, so `document`, `Blob`, and `URL.createObjectURL` must be stubbed:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserFilesHost } from './filesBrowser';

interface FakeAnchor {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
}

function stubDom(): { anchor: FakeAnchor; revoked: string[] } {
  const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
  const revoked: string[] = [];

  vi.stubGlobal('document', { createElement: () => anchor });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:fake-url',
    revokeObjectURL: (url: string) => revoked.push(url),
  });

  return { anchor, revoked };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserFilesHost.saveFile', () => {
  it('clicks a download anchor with the given filename', () => {
    const { anchor } = stubDom();

    browserFilesHost.saveFile('report.md', '# hi', 'text/markdown');

    expect(anchor.download).toBe('report.md');
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  it('revokes the object URL afterwards', () => {
    const { revoked } = stubDom();

    browserFilesHost.saveFile('report.md', '# hi', 'text/markdown');

    expect(revoked).toEqual(['blob:fake-url']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/host/browser/filesBrowser.test.ts`
Expected: FAIL — `browserFilesHost is not implemented yet` from the Task 1 stub.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib/host/browser/filesBrowser.ts`:

```ts
import type { FilesHost } from '../types';

export const browserFilesHost: FilesHost = {
  saveFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/host/browser/filesBrowser.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Point `downloadFile` at the host**

In `src/lib/export.ts`, add the import at the top of the file, next to the existing
imports:

```ts
import { getHost } from './host';
```

Then replace the `downloadFile` function (currently at line 190) with:

```ts
export function downloadFile(filename: string, content: string, mimeType: string): void {
  getHost().files.saveFile(filename, content, mimeType);
}
```

Leave the `// File download helper` comment block above it in place.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS. There is no `src/lib/export.test.ts` today, so nothing else needs
updating — `downloadFile` is covered indirectly by
`tests/release/11-export.spec.ts` in Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/lib/host/browser/filesBrowser.ts src/lib/host/browser/filesBrowser.test.ts src/lib/export.ts
git commit -m "feat(host): route file downloads through the files host"
```

---

## Task 5: De-duplicate the journal export

`ObservationJournalPanel` has its own inline copy of the download logic. Now that
`downloadFile` goes through the host, this duplicate would bypass it — and in Phase 2
would silently skip the native save dialog.

**Files:**
- Modify: `src/components/ObservationJournalPanel.tsx:125-135`

- [ ] **Step 1: Replace the inline duplicate**

In `src/components/ObservationJournalPanel.tsx`, add `downloadFile` to the imports:

```ts
import { downloadFile } from '../lib/export';
```

Then replace the `exportMarkdown` callback with:

```ts
  const exportMarkdown = useCallback(() => {
    if (!journal) return;
    const slug = journal.serverName.replace(/\s+/g, '-').toLowerCase();
    downloadFile(
      `observation-journal-${slug}.md`,
      exportJournalMarkdown(journal),
      'text/markdown;charset=utf-8',
    );
  }, [journal]);
```

The generated filename is unchanged, so `tests/release/22-trust-evaluators.spec.ts`
keeps passing.

- [ ] **Step 2: Verify build, lint, and unit tests**

Run: `npm run build && npm run lint && npm test`
Expected: all three succeed.

- [ ] **Step 3: Commit**

```bash
git add src/components/ObservationJournalPanel.tsx
git commit -m "refactor(journal): reuse downloadFile instead of an inline duplicate"
```

---

## Task 6: Prove the browser path is unchanged

This is the acceptance criterion for the whole phase.

**Files:** none modified. If you find yourself editing a file under `tests/release/`,
stop — the seam has leaked and the cause must be fixed in `src/`.

- [ ] **Step 1: Confirm the release specs are untouched**

Run: `git status --short tests/release/`
Expected: no output.

- [ ] **Step 2: Start the fixture MCP server**

Specs 05 onward need an MCP server at `http://localhost:3001/mcp`. Start the project's
fixture server in a separate terminal and confirm it is listening:

Run: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/mcp`
Expected: a non-`000` status code. `000` means nothing is listening — the live-connection
specs will fail for that reason and not because of this refactor.

- [ ] **Step 3: Run the full release suite**

Run: `npx playwright test tests/release/`
Expected: all 23 spec files pass. Pay particular attention to
`15-protocol-inspector.spec.ts` (tracing still works), `22-stdio-transport.spec.ts`
(stdio still connects), `11-export.spec.ts` and `22-trust-evaluators.spec.ts` (downloads
still work).

- [ ] **Step 4: Verify no leftover SDK imports in mcpClient**

Run: `grep -n "modelcontextprotocol" src/lib/mcpClient.ts`
Expected: no output. The SDK must now only be imported by
`src/lib/host/browser/mcpBrowser.ts`.

Run: `grep -rln "modelcontextprotocol" src/ --include="*.ts" --include="*.tsx" | grep -v test`
Expected: exactly three files, and no others:
- `src/lib/host/browser/mcpBrowser.ts` — the only transport construction. This is the one that matters.
- `src/lib/connectionErrorMessage.ts` — pre-existing, imports the `UnauthorizedError` and
  `StreamableHTTPError` *classes* for `instanceof` checks, not transport. Out of scope here.
- `src/components/ServerFormDialog.tsx` — a false positive: the string
  `@modelcontextprotocol/server-filesystem` appears in placeholder text, not an import.

**Phase 2 note:** `connectionErrorMessage.ts` relying on `instanceof` is a known problem for
Electron. Errors crossing the IPC boundary lose their prototype chain, so those checks will
silently stop matching. Phase 2 must serialise an error code across IPC rather than relying
on class identity.

- [ ] **Step 5: Commit any fixes and tag the phase complete**

If Steps 1-4 required no changes, there is nothing to commit. Otherwise commit the fixes:

```bash
git add -A src/
git commit -m "fix(host): address release-suite regressions from the host seam"
```

---

## Definition of done

- [ ] `npm run build` succeeds.
- [ ] `npm run lint` succeeds.
- [ ] `npm test` succeeds.
- [ ] `npx playwright test tests/release/` passes with `tests/release/` unmodified.
- [ ] `src/lib/mcpClient.ts` imports no MCP SDK module.
- [ ] `src/lib/protocolTrace.ts`, `src/components/useProtocolTraces.ts`, and
      `src/components/ProtocolInspectorPanel.tsx` are unmodified.
- [ ] `App.tsx`, `ToolDetail.tsx`, `ResourceDetail.tsx`, and `PromptDetail.tsx` are
      unmodified.

Documentation updates (`CLAUDE.md`, `SKILL.md`, `README.md`) are deliberately **not** in
this phase — no user-visible feature has changed. They land with Phase 2, which is where
the desktop app becomes visible to users.
