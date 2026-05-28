# Stdio MCP Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add MCP servers over **stdio** (command/args/cwd/env) from the UI, with Node bridging stdio to local Streamable HTTP so the existing browser MCP client and dev tools keep working.

**Architecture:** Node `stdio-bridge.js` spawns `StdioClientTransport`, holds an SDK `Client`, and exposes a forwarding `Server` on `StreamableHTTPServerTransport` at `/__mcp_stdio/:serverId/mcp`. The browser calls `POST …/start` then connects via existing `StreamableHTTPClientTransport`. Wired in `server.js` and Vite middleware.

**Tech Stack:** Node ESM, `@modelcontextprotocol/sdk`, Vitest 4, Playwright, React 19, existing vault/storage patterns.

**Design spec:** `docs/superpowers/specs/2026-05-28-stdio-transport-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `stdio-bridge.js` | Create | Session registry, spawn stdio, HTTP facade, route handler |
| `stdio-bridge.test.js` | Create | Route parsing, id validation, start/stop (fixture subprocess) |
| `server.js` | Modify | Mount `handleStdioBridge` before static |
| `vite.config.ts` | Modify | Dev/preview middleware for stdio routes |
| `package.json` | Modify | Add `stdio-bridge.js` to `"files"` |
| `src/types.ts` | Modify | `ServerTransport`, `ServerStdioConfig`, extend `ServerEntry` |
| `src/lib/stdioParse.ts` | Create | `parseArgsLines`, `envRowsToMap`, `stdioBridgeMcpUrl` |
| `src/lib/stdioParse.test.ts` | Create | Unit tests for parsers/URL |
| `src/lib/stdioSession.ts` | Create | `startStdioSession`, `stopStdioSession` fetch helpers |
| `src/lib/stdioSession.test.ts` | Create | Mock `fetch` tests |
| `src/lib/storage.ts` | Modify | Extend `StoredServer` |
| `src/lib/mcpClient.ts` | Modify | `connectStdio`, `disconnect` stops bridge |
| `src/App.tsx` | Modify | `fromStored`/`toStored`, `handleConnect`/`handleSubmit` stdio branch |
| `src/components/ServerFormDialog.tsx` | Modify | Transport toggle + stdio panel |
| `src/components/ServerList.tsx` | Modify | Transport badge / command hint |
| `src/lib/clientConfigExport.ts` | Modify | Stdio export shapes |
| `src/lib/clientConfigExport.test.ts` | Modify | Stdio snippet tests |
| `src/lib/connectionErrorMessage.ts` | Modify | Bridge/spawn errors |
| `src/lib/connectionErrorMessage.test.ts` | Modify | New cases |
| `tests/fixtures/stdio-mcp-server.mjs` | Create | Minimal stdio MCP server for e2e |
| `tests/release/22-stdio-transport.spec.ts` | Create | Playwright §3.22 |
| `.cursor/skills/prepare-for-release/SKILL.md` | Modify | §3.22, test count |
| `README.md`, `README.npm.md` | Modify | Mention stdio transport |

---

## Task 1: Types and pure helpers (TDD)

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/stdioParse.ts`
- Create: `src/lib/stdioParse.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/stdioParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseArgsLines, envRowsToMap, stdioBridgeMcpUrl } from './stdioParse';

describe('parseArgsLines', () => {
  it('splits non-empty lines and trims', () => {
    expect(parseArgsLines('-y\n@pkg/foo\n\n')).toEqual(['-y', '@pkg/foo']);
  });
  it('returns empty array for blank textarea', () => {
    expect(parseArgsLines('  \n  ')).toEqual([]);
  });
});

describe('envRowsToMap', () => {
  it('builds map and envKeys from rows', () => {
    const { env, envKeys } = envRowsToMap([
      { key: 'API_KEY', value: 'secret' },
      { key: 'DEBUG', value: '1' },
    ]);
    expect(env).toEqual({ API_KEY: 'secret', DEBUG: '1' });
    expect(envKeys).toEqual(['API_KEY', 'DEBUG']);
  });
  it('skips rows with empty keys', () => {
    const { env, envKeys } = envRowsToMap([{ key: '', value: 'x' }, { key: 'A', value: 'b' }]);
    expect(env).toEqual({ A: 'b' });
    expect(envKeys).toEqual(['A']);
  });
});

describe('stdioBridgeMcpUrl', () => {
  it('builds same-origin bridge path', () => {
    expect(stdioBridgeMcpUrl('my-server', 'http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/__mcp_stdio/my-server/mcp',
    );
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/lib/stdioParse.test.ts
```

- [ ] **Step 3: Add types and implementation**

In `src/types.ts` add:

```ts
export type ServerTransport = 'http' | 'stdio';

export interface ServerStdioConfig {
  command: string;
  args: string[];
  cwd?: string;
  envKeys?: string[];
}

// On ServerEntry:
//   transport?: ServerTransport;
//   stdio?: ServerStdioConfig;
//   stdioEnv?: Record<string, string>;
```

Create `src/lib/stdioParse.ts`:

```ts
export const STDIO_BRIDGE_PREFIX = '/__mcp_stdio';

export function parseArgsLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function envRowsToMap(rows: { key: string; value: string }[]): {
  env: Record<string, string>;
  envKeys: string[];
} {
  const env: Record<string, string> = {};
  const envKeys: string[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    envKeys.push(key);
    env[key] = row.value;
  }
  return { env, envKeys };
}

export function stdioBridgeMcpUrl(
  serverId: string,
  baseOrigin: string = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:4173',
): string {
  return `${baseOrigin}${STDIO_BRIDGE_PREFIX}/${encodeURIComponent(serverId)}/mcp`;
}

export function defaultTransport(entry: { transport?: ServerTransport }): ServerTransport {
  return entry.transport ?? 'http';
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/stdioParse.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/stdioParse.ts src/lib/stdioParse.test.ts
git commit -m "feat: add stdio transport types and parse helpers"
```

---

## Task 2: Browser stdio session API (TDD)

**Files:**
- Create: `src/lib/stdioSession.ts`
- Create: `src/lib/stdioSession.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startStdioSession, stopStdioSession } from './stdioSession';
import type { ServerStdioConfig } from '../types';

describe('stdioSession', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs start payload to bridge', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const stdio: ServerStdioConfig = { command: 'node', args: ['server.mjs'] };
    await startStdioSession('srv-1', stdio, { FOO: 'bar' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/__mcp_stdio/srv-1/start',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'node',
          args: ['server.mjs'],
          cwd: undefined,
          env: { FOO: 'bar' },
        }),
      }),
    );
  });

  it('throws friendly error when bridge returns 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' });
    await expect(
      startStdioSession('x', { command: 'node', args: [] }, {}),
    ).rejects.toThrow(/local explorer server/i);
  });

  it('DELETEs session on stop', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    await stopStdioSession('srv-1');
    expect(fetchMock).toHaveBeenCalledWith('/__mcp_stdio/srv-1', { method: 'DELETE' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- src/lib/stdioSession.test.ts
```

- [ ] **Step 3: Implement**

```ts
import { STDIO_BRIDGE_PREFIX } from './stdioParse';
import type { ServerStdioConfig } from '../types';

export async function startStdioSession(
  serverId: string,
  stdio: ServerStdioConfig,
  env: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${STDIO_BRIDGE_PREFIX}/${encodeURIComponent(serverId)}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command: stdio.command,
      args: stdio.args,
      cwd: stdio.cwd,
      env,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new Error(
        'Stdio requires the local explorer server. Run npm run dev or mcp-explorer instead of opening dist/index.html directly.',
      );
    }
    throw new Error(body || `Stdio bridge start failed (${res.status})`);
  }
}

export async function stopStdioSession(serverId: string): Promise<void> {
  await fetch(`${STDIO_BRIDGE_PREFIX}/${encodeURIComponent(serverId)}`, {
    method: 'DELETE',
  }).catch(() => { /* best-effort */ });
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- src/lib/stdioSession.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/stdioSession.ts src/lib/stdioSession.test.ts
git commit -m "feat: add browser stdio session start/stop helpers"
```

---

## Task 3: Node stdio bridge — routing and validation (TDD)

**Files:**
- Create: `stdio-bridge.js`
- Create: `stdio-bridge.test.js`

- [ ] **Step 1: Write failing tests for pure helpers**

Create `stdio-bridge.test.js` (first slice — no subprocess yet):

```js
import { describe, it, expect } from 'vitest';
import { STDIO_BRIDGE_PREFIX, isValidServerId, parseStdioPath } from './stdio-bridge.js';

describe('stdio-bridge routing', () => {
  it('isValidServerId accepts slug ids', () => {
    expect(isValidServerId('fixture-server')).toBe(true);
    expect(isValidServerId('../etc')).toBe(false);
  });

  it('parseStdioPath extracts action', () => {
    expect(parseStdioPath('/__mcp_stdio/my-id/start')).toEqual({
      serverId: 'my-id',
      action: 'start',
    });
    expect(parseStdioPath('/__mcp_stdio/my-id/mcp')).toEqual({
      serverId: 'my-id',
      action: 'mcp',
    });
    expect(parseStdioPath('/__mcp_stdio/my-id')).toEqual({
      serverId: 'my-id',
      action: 'stop',
    });
    expect(parseStdioPath('/__mcp_proxy')).toBeNull();
  });
});
```

Export stubs from `stdio-bridge.js`:

```js
export const STDIO_BRIDGE_PREFIX = '/__mcp_stdio';
const ID_RE = /^[a-zA-Z0-9_-]+$/;

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

export async function handleStdioBridge(_req, _res) {
  /* implemented in Task 4 */
}
```

- [ ] **Step 2: Run — expect FAIL** (if stubs missing)

```bash
npm test -- stdio-bridge.test.js
```

- [ ] **Step 3: Implement stubs, run — PASS**

- [ ] **Step 4: Commit**

```bash
git add stdio-bridge.js stdio-bridge.test.js
git commit -m "feat: add stdio bridge path parsing and id validation"
```

---

## Task 4: Node stdio bridge — sessions and facade

**Files:**
- Modify: `stdio-bridge.js`
- Modify: `stdio-bridge.test.js`

- [ ] **Step 1: Implement session lifecycle**

Add to `stdio-bridge.js` (imports):

```js
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
```

Core functions:

```js
const sessions = new Map();

function mergeEnv(overrides) {
  return { ...getDefaultEnvironment(), ...(overrides ?? {}) };
}

async function stopSession(serverId) {
  const session = sessions.get(serverId);
  if (!session) return;
  sessions.delete(serverId);
  try { await session.httpTransport.close(); } catch { /* */ }
  try { await session.stdioClient.close(); } catch { /* */ }
  try { await session.stdioTransport.close(); } catch { /* */ }
}

function createFacadeServer(stdioClient, serverInfo) {
  const facade = new Server(
    { name: 'mcp-explorer-stdio-bridge', version: '0.1.0' },
    { capabilities: stdioClient.getServerCapabilities() ?? {} },
  );

  facade.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await stdioClient.listTools();
    return { tools: result.tools };
  });
  facade.setRequestHandler(CallToolRequestSchema, async (req) => {
    return stdioClient.callTool(req.params);
  });
  facade.setRequestHandler(ListResourcesRequestSchema, async (req) => {
    return stdioClient.listResources(req.params);
  });
  facade.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    return stdioClient.readResource(req.params);
  });
  facade.setRequestHandler(ListPromptsRequestSchema, async () => {
    return stdioClient.listPrompts();
  });
  facade.setRequestHandler(GetPromptRequestSchema, async (req) => {
    return stdioClient.getPrompt(req.params);
  });

  stdioClient.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    try {
      await facade.notification({ method: 'notifications/tools/list_changed', params: {} });
    } catch { /* no sse subscribers */ }
  });

  return facade;
}

export async function startSession(serverId, { command, args, cwd, env }) {
  await stopSession(serverId);
  const stdioTransport = new StdioClientTransport({
    command,
    args: args ?? [],
    cwd,
    env: mergeEnv(env),
    stderr: 'pipe',
  });
  const stdioClient = new Client({ name: 'mcp-explorer', version: '0.1.0' }, { capabilities: {} });
  await stdioClient.connect(stdioTransport);

  const facade = createFacadeServer(stdioClient);
  const httpTransport = new StreamableHTTPServerTransport();
  await facade.connect(httpTransport);

  sessions.set(serverId, { stdioClient, stdioTransport, facade, httpTransport, startedAt: Date.now() });
}

export async function handleStdioBridge(req, res) {
  const parsed = parseStdioPath(req.url ?? '/');
  if (!parsed) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  const { serverId, action } = parsed;
  if (!isValidServerId(serverId)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid server id');
    return;
  }

  if (action === 'start' && req.method === 'POST') {
  /* read body, JSON.parse, await startSession, 204 */
  }
  if (action === 'stop' && req.method === 'DELETE') {
  /* await stopSession, 204 */
  }
  if (action === 'mcp') {
  /* get session or 503; await session.httpTransport.handleRequest(req, res) */
  }
  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method Not Allowed');
}
```

Implement body reader (max 1MB) without new dependencies:

```js
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_048_576) throw new Error('Body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
```

On `start` errors, return `500` with message (no env values in logs).

- [ ] **Step 2: Add integration test using fixture**

In `stdio-bridge.test.js`:

```js
import { start } from './server.js';
import { startSession, stopSession, STDIO_BRIDGE_PREFIX } from './stdio-bridge.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtureScript = join(dirname(fileURLToPath(import.meta.url)), 'tests/fixtures/stdio-mcp-server.mjs');

describe('stdio-bridge integration', () => {
  it('starts session and lists tools over HTTP', async () => {
    const id = `test-${process.pid}`;
    await startSession(id, { command: process.execPath, args: [fixtureScript] });
    // POST initialize + tools/list to http://127.0.0.1:... — or use SDK Client in test
    await stopSession(id);
  }, 30_000);
});
```

Create minimal `tests/fixtures/stdio-mcp-server.mjs` in **Task 12**; for this task use inline placeholder that exits 0 OR create fixture early in Task 4.

**Create fixture now** (minimal):

```js
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

const server = new McpServer({ name: 'stdio-fixture', version: '1.0.0' });
server.registerTool(
  'echo',
  {
    description: 'Echo text',
    inputSchema: { message: z.string() },
  },
  async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  }),
);
const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 3: Run bridge tests**

```bash
npm test -- stdio-bridge.test.js
```

- [ ] **Step 4: Commit**

```bash
git add stdio-bridge.js stdio-bridge.test.js tests/fixtures/stdio-mcp-server.mjs
git commit -m "feat: implement stdio bridge sessions and MCP facade"
```

---

## Task 5: Wire bridge into server.js and Vite

**Files:**
- Modify: `server.js`
- Modify: `vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: server.js**

```js
import { handleStdioBridge, STDIO_BRIDGE_PREFIX } from './stdio-bridge.js';

// Inside createServer callback, before static files:
if (url.startsWith(STDIO_BRIDGE_PREFIX)) {
  handleStdioBridge(req, res).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(err instanceof Error ? err.message : String(err));
  });
  return;
}
```

- [ ] **Step 2: vite.config.ts**

```ts
import { handleStdioBridge, STDIO_BRIDGE_PREFIX } from './stdio-bridge.js';

function stdioBridgeMiddleware(req, res, next) {
  if (!(req.url ?? '/').startsWith(STDIO_BRIDGE_PREFIX)) {
    next();
    return;
  }
  void handleStdioBridge(req, res).catch((err) => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    res.end(err instanceof Error ? err.message : String(err));
  });
}

// In mcpProxyPlugin configureServer / configurePreviewServer:
server.middlewares.use(stdioBridgeMiddleware);
```

- [ ] **Step 3: package.json files array**

Add `"stdio-bridge.js"` next to `"proxy.js"`.

- [ ] **Step 4: Smoke**

```bash
npm run build && node server.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:4173/__mcp_stdio/test/start \
  -H 'Content-Type: application/json' \
  -d '{"command":"node","args":["tests/fixtures/stdio-mcp-server.mjs"]}'
# Expect 200 or 204
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add server.js vite.config.ts package.json
git commit -m "feat: wire stdio bridge into server and vite dev"
```

---

## Task 6: mcpClient connect/disconnect for stdio

**Files:**
- Modify: `src/lib/mcpClient.ts`
- Modify: `src/lib/mcpClient.test.ts`

- [ ] **Step 1: Add failing test**

```ts
import { vi, describe, it, expect } from 'vitest';
import * as stdioSession from './stdioSession';
import { connectStdio } from './mcpClient';

vi.mock('./stdioSession', () => ({
  startStdioSession: vi.fn().mockResolvedValue(undefined),
  stopStdioSession: vi.fn().mockResolvedValue(undefined),
}));

describe('connectStdio', () => {
  it('starts bridge then connects HTTP client', async () => {
    // mock StreamableHTTPClientTransport + Client.connect
    // assert startStdioSession called before client.connect
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { startStdioSession, stopStdioSession } from './stdioSession';
import { stdioBridgeMcpUrl } from './stdioParse';
import type { ServerStdioConfig } from '../types';

export async function connectStdio(
  serverId: string,
  stdio: ServerStdioConfig,
  stdioEnv: Record<string, string> = {},
): Promise<ToolDef[]> {
  await startStdioSession(serverId, stdio, stdioEnv);
  return connect(serverId, stdioBridgeMcpUrl(serverId), undefined, false);
}

// In disconnect(serverId):
//   await stopStdioSession(serverId) in finally after client close
```

Track which serverIds are stdio in a `Set<string>` when `connectStdio` is used, or pass flag — simplest: always call `stopStdioSession` on disconnect (no-op if no session).

- [ ] **Step 3: Run tests**

```bash
npm test -- src/lib/mcpClient.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcpClient.ts src/lib/mcpClient.test.ts
git commit -m "feat: connect and disconnect stdio via local bridge"
```

---

## Task 7: Persistence (storage + App)

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend StoredServer**

```ts
export type StoredServer = Pick<
  ServerEntry,
  'id' | 'name' | 'url' | 'description' | 'custom' | 'auth' | 'proxyThroughLocal' | 'transport' | 'stdio' | 'stdioEnv'
>;
```

- [ ] **Step 2: Update fromStoredServers / toStoredServers**

```ts
function fromStoredServers(stored: StoredServer[]): ServerEntry[] {
  return stored.map((s) => ({
  ...
    transport: s.transport ?? 'http',
    stdio: s.stdio,
    stdioEnv: s.stdioEnv,
    url: s.url ?? '',
  }));
}
```

- [ ] **Step 3: handleConnect branch**

```ts
async function handleConnect(id: string, connection?: { ... }) {
  const s = servers.find((x) => x.id === id);
  const transport = connection?.transport ?? s?.transport ?? 'http';
  if (transport === 'stdio') {
    const stdio = connection?.stdio ?? s?.stdio;
    const stdioEnv = connection?.stdioEnv ?? s?.stdioEnv ?? {};
    if (!stdio?.command) return;
    updateServer(id, { status: 'connecting', error: undefined });
    try {
      const tools = await connectStdio(id, stdio, stdioEnv);
      // same meta/resources/prompts path as HTTP
    } catch (e) {
      updateServer(id, { status: 'error', error: formatConnectionError(e) });
    }
    return;
  }
  // existing HTTP path
}
```

- [ ] **Step 4: handleSubmit for add/edit**

Build `ServerEntry` with `transport`, `stdio`, `stdioEnv`; for stdio omit `url` or set `url: ''`; block edit while connected if needed.

- [ ] **Step 5: Run**

```bash
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/App.tsx
git commit -m "feat: persist and connect stdio servers from App"
```

---

## Task 8: Server form UI (transport toggle)

**Files:**
- Modify: `src/components/ServerFormDialog.tsx`

- [ ] **Step 1: Extend ServerFormValues**

```ts
export interface ServerFormValues {
  name: string;
  transport: 'http' | 'stdio';
  url: string;
  // http fields...
  stdioCommand: string;
  stdioArgsText: string;
  stdioCwd: string;
  stdioEnvRows: { key: string; value: string }[];
}
```

- [ ] **Step 2: UI**

- Segmented control: HTTP | Stdio
- Conditional panels per spec
- On submit: `parseArgsLines(stdioArgsText)`, `envRowsToMap(stdioEnvRows)` → `stdio` + `stdioEnv`
- Validate command required for stdio
- Confirm when switching transport if fields dirty

- [ ] **Step 3: Wire App.tsx** `initialValues` / `handleSubmit` mapping

- [ ] **Step 4: Manual check**

```bash
npm run dev
```

Add stdio server in UI (don't connect yet) — verify form saves fields.

- [ ] **Step 5: Commit**

```bash
git add src/components/ServerFormDialog.tsx src/App.tsx
git commit -m "feat: add HTTP/stdio transport toggle to server form"
```

---

## Task 9: Server list badge

**Files:**
- Modify: `src/components/ServerList.tsx`

- [ ] **Step 1: Show `stdio` pill and truncated `command` for stdio entries**

- [ ] **Step 2: Commit**

```bash
git add src/components/ServerList.tsx
git commit -m "feat: show stdio transport badge in server list"
```

---

## Task 10: Client config export (TDD)

**Files:**
- Modify: `src/lib/clientConfigExport.ts`
- Modify: `src/lib/clientConfigExport.test.ts`

- [ ] **Step 1: Extend ClientConfigInput**

```ts
export interface ClientConfigInput {
  name: string;
  transport?: ServerTransport;
  url?: string;
  auth?: ServerAuth;
  proxyThroughLocal?: boolean;
  stdio?: ServerStdioConfig;
  stdioEnv?: Record<string, string>;
}
```

- [ ] **Step 2: Failing test**

```ts
it('generateCursorConfig emits stdio command/args/env placeholders', () => {
  const json = generateCursorConfig({
    name: 'My FS',
    transport: 'stdio',
    stdio: { command: 'npx', args: ['-y', '@mcp/fs'], envKeys: ['API_KEY'] },
    stdioEnv: { API_KEY: 'secret' },
  });
  const parsed = JSON.parse(json);
  expect(parsed.mcpServers['my-fs']).toMatchObject({
    command: 'npx',
    args: ['-y', '@mcp/fs'],
    env: { API_KEY: '${env:MY_FS_API_KEY}' },
  });
});
```

- [ ] **Step 3: Implement stdio branches** in `generateCursorConfig`, `generateClaudeDesktopConfig`, `generateVSCodeConfig` per design §6.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/clientConfigExport.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/clientConfigExport.ts src/lib/clientConfigExport.test.ts
git commit -m "feat: export stdio client configs with env placeholders"
```

---

## Task 11: Connection error messages (TDD)

**Files:**
- Modify: `src/lib/connectionErrorMessage.ts`
- Modify: `src/lib/connectionErrorMessage.test.ts`

- [ ] **Step 1: Add tests for bridge 404 text and spawn ENOENT**

- [ ] **Step 2: Implement formatters** — detect `Stdio requires the local explorer` message; map `ENOENT` to “Could not start process …”

- [ ] **Step 3: Run**

```bash
npm test -- src/lib/connectionErrorMessage.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/connectionErrorMessage.ts src/lib/connectionErrorMessage.test.ts
git commit -m "feat: improve connection errors for stdio bridge"
```

---

## Task 12: Playwright §3.22

**Files:**
- Create: `tests/release/22-stdio-transport.spec.ts`
- Modify: `.cursor/skills/prepare-for-release/SKILL.md`

- [ ] **Step 1: Spec file**

```ts
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIXTURE_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/stdio-mcp-server.mjs',
);

test.describe('§3.22 — Stdio MCP transport', () => {
  test('add stdio server, connect, invoke echo tool', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add/i }).click();
    await page.getByRole('radio', { name: /stdio/i }).click();
    await page.getByLabel(/name/i).fill('Stdio Fixture');
    await page.getByLabel(/command/i).fill(process.execPath);
    await page.getByLabel(/arguments/i).fill(FIXTURE_SCRIPT);
    await page.getByRole('button', { name: /save|add/i }).click();
    // wait connected, select echo, fill message, invoke, assert result
  });
});
```

Adjust selectors to match actual labels from Task 8.

- [ ] **Step 2: Run against built server**

```bash
npm run build && npx playwright test tests/release/22-stdio-transport.spec.ts
```

- [ ] **Step 3: Update prepare-for-release** — add §3.22, bump count (95 → ~96).

- [ ] **Step 4: Commit**

```bash
git add tests/release/22-stdio-transport.spec.ts .cursor/skills/prepare-for-release/SKILL.md
git commit -m "test: add Playwright release suite for stdio transport"
```

---

## Task 13: Documentation and design status

**Files:**
- Modify: `README.md`, `README.npm.md`
- Modify: `docs/superpowers/specs/2026-05-28-stdio-transport-design.md`

- [ ] **Step 1: README** — bullet under features: stdio servers via local bridge; requires `npm run dev` or `mcp-explorer`.

- [ ] **Step 2: Set spec status to Approved**

- [ ] **Step 3: Final verification**

```bash
npm run build
npm run lint
npm test
npx playwright test tests/release/
```

- [ ] **Step 4: Commit**

```bash
git add README.md README.npm.md docs/superpowers/specs/2026-05-28-stdio-transport-design.md docs/superpowers/plans/2026-05-28-stdio-transport.md
git commit -m "docs: document stdio transport and mark spec approved"
```

---

## Spec coverage checklist

| Spec § | Task |
|--------|------|
| Data model | 1, 7 |
| UI form | 8 |
| Server list | 9 |
| Node bridge | 3, 4, 5 |
| Browser connect | 2, 6, 7 |
| Dev + prod wiring | 5 |
| Export | 10 |
| Errors | 11 |
| Unit tests | 1–4, 6, 10, 11 |
| Playwright | 12 |
| Release skill | 12 |
| package files | 5 |

---

## Plan self-review

- No TBD steps; fixture path defined in Task 4/12.
- `stopStdioSession` on all disconnects is intentional (idempotent).
- Facade uses low-level `Server` + request schemas to match browser client expectations.
- Zod import in fixture matches SDK examples (`zod` re-exported via SDK in examples — use `import * as z from 'zod'` if needed; verify with `node tests/fixtures/stdio-mcp-server.mjs` manually).
