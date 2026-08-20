# Electron App Shell + Direct MCP Transport (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Electron desktop app that runs the existing React UI and talks to MCP servers directly from the main process — no CORS proxy, no stdio HTTP bridge.

**Architecture:** Electron main owns the `@modelcontextprotocol/sdk` clients. A sandboxed CommonJS preload exposes a narrow frozen `window.mcpExplorer` over `contextBridge`. A new `electronHost` implements the Phase 1 `McpHost` interface by calling that bridge. `getHost()` picks it when the bridge is present, so the browser path is untouched.

**Tech Stack:** Electron 43, `@modelcontextprotocol/sdk` (main-process client + `StdioClientTransport`), Playwright `_electron`, Vitest.

**Depends on:** Phase 1 (`docs/superpowers/plans/2026-08-20-electron-host-seam.md`), complete and merged.

**Source spec:** `docs/superpowers/specs/2026-08-20-electron-desktop-app-design.md`

**Deferred to Phase 2b:** OS keychain auto-unlock (`SecretsHost`), native save dialogs, and app data in `~/.mcp-explorer/`. In this phase the desktop app still prompts for the vault passphrase and stores data in the renderer's IndexedDB/localStorage under the `app://` origin.

---

## Verified environment facts

Do not re-derive these; they were checked against the installed toolchain.

- Electron **43.4.1**, electron-builder **26.15.3** are the current published versions.
- `@playwright/test` already exports `_electron` — no new dependency needed for E2E.
- WSLg is present (`DISPLAY=:0`) and `xvfb-run` is installed, so Electron GUI tests run locally.
- `StdioClientTransport` (`@modelcontextprotocol/sdk/client/stdio.js`) takes
  `{ command, args?, env?, cwd?, stderr? }`.
- Vitest's `include` in `vite.config.ts:110` is `['src/**/*.test.ts', '*.test.js']` —
  it does **not** cover `electron/**`. Task 1 fixes that.
- `package.json` currently has an uncommitted local edit (`test:e2e` → `--headed`).
  Preserve it; do not revert it while editing that file.

---

## Five deliberate deviations from the spec

The spec was written before these constraints were checked. Each deviation is a
correction, not a shortcut.

1. **The renderer loads from `app://`, not `file://`.** A `file://` page has an opaque
   origin, which makes `localStorage` unreliable and partitions IndexedDB
   unpredictably. The vault stores its envelope in IndexedDB and the server list uses
   `localStorage`, so a stable origin is load-bearing. A custom standard scheme
   registered via `protocol.registerSchemesAsPrivileged` + `protocol.handle` gives
   normal web semantics.

2. **The preload is CommonJS (`electron/preload.cjs`).** Sandboxed preload scripts
   cannot be ES modules, and `package.json` sets `"type": "module"`, so a `.js` preload
   would be parsed as ESM and fail. The `.cjs` extension forces CommonJS. We keep
   `sandbox: true` rather than weakening it to allow an ESM preload.

3. **`isConnected` is mirrored in the renderer, not sent over IPC.** The Phase 1
   `McpHost.isConnected(serverId): boolean` is synchronous. The only synchronous IPC is
   `ipcRenderer.sendSync`, which blocks the renderer. Instead `electronHost` keeps a
   local `Set<string>` updated when connect/disconnect resolve and when main pushes a
   `mcp:closed` event.

4. **Errors cross IPC as a structured envelope.** Electron wraps anything thrown inside
   `ipcMain.handle` in a generic `Error` with a mangled message, and prototypes do not
   survive. Every handler returns `{ ok: true, value }` or
   `{ ok: false, error: { code, message } }`, and the renderer rethrows a reconstructed
   `Error` carrying `.code`. This also resolves the known hazard recorded in the Phase 1
   plan about `connectionErrorMessage.ts` relying on `instanceof`.

5. **`electronHost.files` reuses `browserFilesHost` in this phase.** A blob download in
   an Electron renderer still triggers Electron's own save dialog, which is acceptable
   until Phase 2b replaces it with `dialog.showSaveDialog`.

---

## File Structure

**Created:**

| File | Responsibility |
|------|---------------|
| `electron/ipc/channels.js` | Channel-name constants and the `ok`/`fail`/`unwrap` envelope helpers. Pure — no Electron import. |
| `electron/ipc/channels.test.js` | Envelope round-trip behaviour. |
| `electron/mcp/sessions.js` | Owns the SDK `Client` map in main. All MCP verbs. No Electron import. |
| `electron/mcp/sessions.test.js` | `serverId` validation and session bookkeeping with an injected fake client factory. |
| `electron/protocol.js` | `app://` request handler serving `dist/`, with traversal guarding. |
| `electron/protocol.test.js` | Path resolution and traversal rejection. |
| `electron/ipc/mcpHandlers.js` | Registers `ipcMain.handle` for every MCP channel; pushes `mcp:toolsChanged` / `mcp:closed`. |
| `electron/window.js` | `BrowserWindow` factory with the security options. |
| `electron/main.js` | App lifecycle, single-instance lock, scheme registration, window wiring. |
| `electron/preload.cjs` | `contextBridge` exposure of `window.mcpExplorer`. CommonJS. |
| `src/lib/host/electron/mcpElectron.ts` | `McpHost` implemented over `window.mcpExplorer`, including the connection mirror. |
| `src/lib/host/electron/index.ts` | Assembles `electronHost: Host`. |
| `src/lib/host/electron/mcpElectron.test.ts` | Drives the host against a fake bridge. |
| `playwright.electron.config.ts` | Second Playwright project for the Electron suite. |
| `tests/electron/helpers.ts` | `launchApp()` and vault setup for Electron. |
| `tests/electron/01-launch.spec.ts` | Window opens, app renders, no console errors. |
| `tests/electron/02-http-direct.spec.ts` | Connects to the fixture with the proxy **off**. |
| `tests/electron/03-stdio-direct.spec.ts` | Spawns a stdio server with no `/__mcp_stdio` traffic. |

**Modified:**

| File | Change |
|------|--------|
| `package.json` | Add `electron` devDependency and `electron:dev` / `electron:start` / `test:e2e:electron` scripts. |
| `vite.config.ts:110` | Extend Vitest `include` with `electron/**/*.test.js`. |
| `src/lib/host/index.ts` | Replace the unconditional browser fallback with bridge detection. |
| `src/lib/host/index.test.ts` | Cover the detection branch. |
| `src/lib/connectionErrorMessage.ts` | Accept an error `code` in addition to the existing `instanceof` checks. |
| `src/lib/connectionErrorMessage.test.ts` | Cover the code path. |
| `.gitignore` | Ignore `release/` (electron-builder output, used in Phase 3). |

**Not touched:** `src/lib/mcpClient.ts`, `src/lib/protocolTrace.ts`, `src/App.tsx`, `proxy.js`, `stdio-bridge.js`, `server.js`, `tests/release/`.

---

## Task 1: Dependencies, scripts, and test config

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts:110`
- Modify: `.gitignore`

- [ ] **Step 1: Install Electron**

Run: `npm install --save-dev electron@43`
Expected: completes; `node_modules/electron` exists. This downloads a ~100 MB binary.

Verify it is a devDependency and did **not** land in `dependencies`:

Run: `node -e "const p=require('./package.json'); console.log('dev:', !!p.devDependencies.electron, 'prod:', !!p.dependencies.electron)"`
Expected: `dev: true prod: false`

- [ ] **Step 2: Add scripts**

In `package.json`, add these three entries to `"scripts"`. Leave every existing script
exactly as it is — in particular do not revert the local `test:e2e` edit.

```json
    "electron:dev": "MCP_EXPLORER_DEV_URL=http://localhost:5173 electron electron/main.js",
    "electron:start": "npm run build && electron electron/main.js",
    "test:e2e:electron": "playwright test --config playwright.electron.config.ts",
```

- [ ] **Step 3: Extend the Vitest include**

In `vite.config.ts`, change the `include` line inside the `test` block:

```ts
    include: ['src/**/*.test.ts', '*.test.js', 'electron/**/*.test.js'],
```

- [ ] **Step 4: Ignore the packaging output**

Append to `.gitignore`:

```
# electron-builder output
/release/
```

- [ ] **Step 5: Verify nothing broke**

Run: `npm test`
Expected: 222 tests still pass (no `electron/` tests exist yet; `passWithNoTests` is already set).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts .gitignore
git commit -m "chore(electron): add electron devDependency, scripts, and test include"
```

---

## Task 2: IPC channel contract and error envelope

Pure module — no Electron import, so it is fully unit-testable.

**Files:**
- Create: `electron/ipc/channels.js`
- Test: `electron/ipc/channels.test.js`

- [ ] **Step 1: Write the failing test**

Create `electron/ipc/channels.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { CHANNELS, fail, ok } from './channels.js';

describe('CHANNELS', () => {
  it('namespaces every channel under mcp:', () => {
    for (const name of Object.values(CHANNELS)) {
      expect(name.startsWith('mcp:')).toBe(true);
    }
  });

  it('has no duplicate channel names', () => {
    const names = Object.values(CHANNELS);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('ok / fail', () => {
  it('wraps a success value', () => {
    expect(ok({ tools: [] })).toEqual({ ok: true, value: { tools: [] } });
  });

  it('wraps undefined', () => {
    expect(ok(undefined)).toEqual({ ok: true, value: undefined });
  });

  it('preserves the original message verbatim', () => {
    expect(fail(new Error('Not connected to server "srv-1"'))).toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'Not connected to server "srv-1"' },
    });
  });

  it('carries an explicit code', () => {
    expect(fail(new Error('boom'), 'E_CONNECT').error.code).toBe('E_CONNECT');
  });

  it('handles non-Error throwables', () => {
    expect(fail('plain string').error.message).toBe('plain string');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/ipc/channels.test.js`
Expected: FAIL — `Cannot find module './channels.js'`.

- [ ] **Step 3: Write the implementation**

Create `electron/ipc/channels.js`:

```js
/**
 * IPC contract shared by the Electron main process and the renderer host.
 *
 * Pure module: no Electron imports, so both sides and the unit tests can load it.
 *
 * Every handler returns an envelope rather than throwing, because Electron wraps
 * anything thrown inside `ipcMain.handle` in a generic Error with a mangled
 * message, and prototypes do not survive the boundary.
 */

export const CHANNELS = {
  connect: 'mcp:connect',
  connectStdio: 'mcp:connectStdio',
  disconnect: 'mcp:disconnect',
  listTools: 'mcp:listTools',
  callTool: 'mcp:callTool',
  listResources: 'mcp:listResources',
  readResource: 'mcp:readResource',
  listPrompts: 'mcp:listPrompts',
  getPrompt: 'mcp:getPrompt',
  // main → renderer pushes
  toolsChanged: 'mcp:toolsChanged',
  closed: 'mcp:closed',
};

export function ok(value) {
  return { ok: true, value };
}

export function fail(error, code = 'E_UNKNOWN') {
  return {
    ok: false,
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

// There is deliberately no `unwrap` here. Main only ever produces envelopes; the
// renderer consumes them, and its typed version lives in
// src/lib/host/electron/mcpElectron.ts. A sandboxed preload cannot import this
// ESM module anyway, so a shared consumer would not help.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/ipc/channels.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/channels.js electron/ipc/channels.test.js
git commit -m "feat(electron): add IPC channel contract and error envelope"
```

---

## Task 3: MCP session manager in main

Owns the SDK clients. Takes an injectable client factory so it is testable without
spawning real servers or opening sockets.

**Files:**
- Create: `electron/mcp/sessions.js`
- Test: `electron/mcp/sessions.test.js`

- [ ] **Step 1: Write the failing test**

Create `electron/mcp/sessions.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionManager, isValidServerId } from './sessions.js';

function fakeClient() {
  return {
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    listTools: vi.fn(async () => ({ tools: [{ name: 'echo' }] })),
    callTool: vi.fn(async () => ({ content: [] })),
    listResources: vi.fn(async () => ({ resources: [], resourceTemplates: [] })),
    readResource: vi.fn(async () => ({ contents: [] })),
    listPrompts: vi.fn(async () => ({ prompts: [] })),
    getPrompt: vi.fn(async () => ({ messages: [] })),
    setNotificationHandler: vi.fn(),
  };
}

describe('isValidServerId', () => {
  it('accepts ordinary ids', () => {
    expect(isValidServerId('srv-1')).toBe(true);
    expect(isValidServerId('a_B-9')).toBe(true);
  });

  it('rejects path traversal and separators', () => {
    expect(isValidServerId('../etc')).toBe(false);
    expect(isValidServerId('a/b')).toBe(false);
    expect(isValidServerId('')).toBe(false);
    expect(isValidServerId(null)).toBe(false);
  });
});

describe('sessionManager', () => {
  let client;
  let manager;

  beforeEach(() => {
    client = fakeClient();
    manager = createSessionManager({
      createClient: () => client,
      createHttpTransport: vi.fn(() => ({ close: vi.fn(async () => undefined) })),
      createStdioTransport: vi.fn(() => ({ close: vi.fn(async () => undefined) })),
    });
  });

  it('rejects an invalid serverId before touching the transport', async () => {
    await expect(manager.connect('../evil', 'https://x/mcp')).rejects.toThrow(
      /invalid server id/i,
    );
  });

  it('connects and reports the session', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    expect(client.connect).toHaveBeenCalled();
    expect(manager.isConnected('srv-1')).toBe(true);
  });

  it('returns the tool list', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    expect(await manager.listTools('srv-1')).toEqual([{ name: 'echo' }]);
  });

  it('throws the standard message when not connected', async () => {
    await expect(manager.callTool('srv-9', 'echo', {})).rejects.toThrow(
      'Not connected to server "srv-9"',
    );
  });

  it('closes the client on disconnect', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    await manager.disconnect('srv-1');
    expect(client.close).toHaveBeenCalled();
    expect(manager.isConnected('srv-1')).toBe(false);
  });

  it('replaces an existing session on reconnect', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    await manager.connect('srv-1', 'https://example.com/mcp');
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('renames resourceTemplates for the renderer', async () => {
    await manager.connect('srv-1', 'https://example.com/mcp');
    const result = await manager.listResources('srv-1');
    expect(result).toHaveProperty('resourceTemplates');
  });

  it('passes stdio params through to the transport factory', async () => {
    const createStdioTransport = vi.fn(() => ({ close: vi.fn(async () => undefined) }));
    manager = createSessionManager({
      createClient: () => client,
      createHttpTransport: vi.fn(),
      createStdioTransport,
    });

    await manager.connectStdio(
      'srv-2',
      { command: 'node', args: ['s.mjs'], cwd: '/tmp' },
      { FOO: 'bar' },
    );

    expect(createStdioTransport).toHaveBeenCalledWith({
      command: 'node',
      args: ['s.mjs'],
      cwd: '/tmp',
      env: { FOO: 'bar' },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/mcp/sessions.test.js`
Expected: FAIL — `Cannot find module './sessions.js'`.

- [ ] **Step 3: Write the implementation**

Create `electron/mcp/sessions.js`:

```js
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

    async closeAll() {
      await Promise.all([...sessions.keys()].map((id) => release(id)));
    },
  };
}
```

Note: `callTool` here does not re-shape the result. `mcpClient.ts` in the renderer
already casts it to `ToolResult`, exactly as the browser host does.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/mcp/sessions.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/mcp/sessions.js electron/mcp/sessions.test.js
git commit -m "feat(electron): add main-process MCP session manager"
```

---

## Task 4: The app:// protocol handler

**Files:**
- Create: `electron/protocol.js`
- Test: `electron/protocol.test.js`

- [ ] **Step 1: Write the failing test**

Create `electron/protocol.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { resolveAppPath } from './protocol.js';

const ROOT = '/app/dist';

describe('resolveAppPath', () => {
  it('maps the root to index.html', () => {
    expect(resolveAppPath('app://mcp-explorer/', ROOT)).toBe('/app/dist/index.html');
  });

  it('maps an asset path', () => {
    expect(resolveAppPath('app://mcp-explorer/assets/main.js', ROOT)).toBe(
      '/app/dist/assets/main.js',
    );
  });

  it('ignores query strings and hashes', () => {
    expect(resolveAppPath('app://mcp-explorer/assets/a.css?v=1#x', ROOT)).toBe(
      '/app/dist/assets/a.css',
    );
  });

  it('falls back to index.html for extensionless routes (SPA)', () => {
    expect(resolveAppPath('app://mcp-explorer/settings', ROOT)).toBe('/app/dist/index.html');
  });

  it('rejects traversal outside the root', () => {
    expect(resolveAppPath('app://mcp-explorer/../../etc/passwd', ROOT)).toBeNull();
  });

  it('rejects encoded traversal', () => {
    expect(resolveAppPath('app://mcp-explorer/%2e%2e%2f%2e%2e%2fetc/passwd', ROOT)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/protocol.test.js`
Expected: FAIL — `Cannot find module './protocol.js'`.

- [ ] **Step 3: Write the implementation**

Create `electron/protocol.js`:

```js
/**
 * Serves the built renderer over a custom `app://` scheme.
 *
 * A custom standard scheme is used rather than `file://` because the renderer
 * needs a stable origin: the vault stores its envelope in IndexedDB and the
 * server list uses localStorage, both of which behave unpredictably on an
 * opaque `file://` origin.
 */
import { extname, join, resolve, sep } from 'node:path';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = 'app://mcp-explorer';

/**
 * Map an `app://` URL to an absolute path inside `root`, or null if the request
 * escapes the root. Extensionless paths fall back to index.html for SPA routing.
 */
export function resolveAppPath(requestUrl, root) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }

  const rootResolved = resolve(root);
  const candidate = resolve(join(rootResolved, pathname));

  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + sep)) {
    return null;
  }

  if (pathname === '/' || pathname === '') return join(rootResolved, 'index.html');
  if (!extname(pathname)) return join(rootResolved, 'index.html');

  return candidate;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/protocol.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/protocol.js electron/protocol.test.js
git commit -m "feat(electron): add app:// protocol path resolution"
```

---

## Task 5: IPC handlers

Wires the session manager to `ipcMain`. Thin by design — the logic is in Task 3.

**Files:**
- Create: `electron/ipc/mcpHandlers.js`

- [ ] **Step 1: Write the implementation**

There is no unit test for this file: it is pure Electron wiring with no branching
logic, and it is covered end-to-end by the Task 10 E2E suite. Create
`electron/ipc/mcpHandlers.js`:

```js
import { ipcMain } from 'electron';
import { CHANNELS, fail, ok } from './channels.js';

/** Wrap a handler so every rejection crosses IPC as a structured envelope. */
function handle(channel, code, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return ok(await fn(...args));
    } catch (err) {
      return fail(err, code);
    }
  });
}

export function registerMcpHandlers(sessions, getWindow) {
  handle(CHANNELS.connect, 'E_CONNECT', (id, url, auth) => sessions.connect(id, url, auth));
  handle(CHANNELS.connectStdio, 'E_CONNECT_STDIO', (id, stdio, env) =>
    sessions.connectStdio(id, stdio, env),
  );
  handle(CHANNELS.disconnect, 'E_DISCONNECT', (id) => sessions.disconnect(id));
  handle(CHANNELS.listTools, 'E_LIST_TOOLS', (id) => sessions.listTools(id));
  handle(CHANNELS.callTool, 'E_CALL_TOOL', (id, name, args) => sessions.callTool(id, name, args));
  handle(CHANNELS.listResources, 'E_LIST_RESOURCES', (id) => sessions.listResources(id));
  handle(CHANNELS.readResource, 'E_READ_RESOURCE', (id, uri) => sessions.readResource(id, uri));
  handle(CHANNELS.listPrompts, 'E_LIST_PROMPTS', (id) => sessions.listPrompts(id));
  handle(CHANNELS.getPrompt, 'E_GET_PROMPT', (id, name, args) =>
    sessions.getPrompt(id, name, args),
  );

  return sessions.onToolsChanged((serverId) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(CHANNELS.toolsChanged, serverId);
    }
  });
}
```

- [ ] **Step 2: Verify it parses**

Run: `node --input-type=module -e "import('./electron/ipc/channels.js').then(m => console.log(Object.keys(m.CHANNELS).length, 'channels'))"`
Expected: `11 channels`

`mcpHandlers.js` itself cannot be imported outside Electron because it imports
`electron`; it is exercised by the E2E suite in Task 10.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/mcpHandlers.js
git commit -m "feat(electron): register MCP IPC handlers"
```

---

## Task 6: Window, main entry, and preload

**Files:**
- Create: `electron/window.js`
- Create: `electron/main.js`
- Create: `electron/preload.cjs`

- [ ] **Step 1: Write the window factory**

Create `electron/window.js`:

```js
import { BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APP_ORIGIN } from './protocol.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      // The renderer displays tool descriptions, markdown, and images from
      // untrusted MCP servers. It must never get Node.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(here, 'preload.cjs'),
    },
  });

  win.once('ready-to-show', () => win.show());

  // Anything that tries to navigate away or open a window goes to the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.MCP_EXPLORER_DEV_URL;
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith(APP_ORIGIN);
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  return win;
}
```

- [ ] **Step 2: Write the preload**

Create `electron/preload.cjs`. It **must** be CommonJS: sandboxed preloads cannot be
ES modules, and `package.json` sets `"type": "module"`, so a `.js` file here would be
parsed as ESM and fail to load.

```js
// CommonJS on purpose — sandboxed preload scripts cannot be ES modules.
const { contextBridge, ipcRenderer } = require('electron');

// Kept in sync with electron/ipc/channels.js. A sandboxed preload cannot import
// an ESM module from the app tree, so the names are duplicated here deliberately.
const INVOKE = [
  'mcp:connect',
  'mcp:connectStdio',
  'mcp:disconnect',
  'mcp:listTools',
  'mcp:callTool',
  'mcp:listResources',
  'mcp:readResource',
  'mcp:listPrompts',
  'mcp:getPrompt',
];

const api = {
  kind: 'electron',
  invoke(channel, ...args) {
    if (!INVOKE.includes(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  onToolsChanged(handler) {
    const listener = (_event, serverId) => handler(serverId);
    ipcRenderer.on('mcp:toolsChanged', listener);
    return () => ipcRenderer.removeListener('mcp:toolsChanged', listener);
  },
  onClosed(handler) {
    const listener = (_event, serverId) => handler(serverId);
    ipcRenderer.on('mcp:closed', listener);
    return () => ipcRenderer.removeListener('mcp:closed', listener);
  },
};

contextBridge.exposeInMainWorld('mcpExplorer', Object.freeze(api));
```

Note the allow-list: the renderer cannot reach an arbitrary channel even if it is
compromised, and `ipcRenderer` itself is never exposed.

- [ ] **Step 3: Write the main entry**

Create `electron/main.js`:

```js
import { app, net, protocol } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP_ORIGIN, APP_SCHEME, resolveAppPath } from './protocol.js';
import { createSessionManager } from './mcp/sessions.js';
import { registerMcpHandlers } from './ipc/mcpHandlers.js';
import { createWindow } from './window.js';

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, '..', 'dist');

// Must run before app ready, and before any top-level await.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let mainWindow = null;
const sessions = createSessionManager();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle(APP_SCHEME, (request) => {
      const filePath = resolveAppPath(request.url, distRoot);
      if (!filePath) return new Response('Not Found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    });

    registerMcpHandlers(sessions, () => mainWindow);

    mainWindow = createWindow();

    const devUrl = process.env.MCP_EXPLORER_DEV_URL;
    void mainWindow.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);

    app.on('activate', () => {
      if (mainWindow === null) {
        mainWindow = createWindow();
        void mainWindow.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    void sessions.closeAll();
  });
}
```

Note: `protocol.registerSchemesAsPrivileged` and `requestSingleInstanceLock` run at
module top level with no `await` before them. In an ESM main process, a top-level
`await` placed above these would let the `ready` event fire first.

- [ ] **Step 4: Verify the app launches**

Run: `npm run build && xvfb-run -a electron electron/main.js`

Expected: the window opens and renders the vault setup screen. At this point
`getHost()` still returns the browser host (Task 8 adds detection), so MCP connections
will fail — that is expected. Close the window to end the run.

If it exits immediately, run without `xvfb-run` first (WSLg provides `DISPLAY=:0`) and
read the stderr.

- [ ] **Step 5: Commit**

```bash
git add electron/window.js electron/main.js electron/preload.cjs
git commit -m "feat(electron): add main process, window, and sandboxed preload"
```

---

## Task 7: The renderer-side Electron host

**Files:**
- Create: `src/lib/host/electron/mcpElectron.ts`
- Create: `src/lib/host/electron/index.ts`
- Test: `src/lib/host/electron/mcpElectron.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/host/electron/mcpElectron.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElectronMcpHost } from './mcpElectron';

function makeBridge(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'electron' as const,
    invoke: vi.fn(async (channel: string) => {
      if (channel === 'mcp:listTools') return { ok: true, value: [{ name: 'echo' }] };
      return { ok: true, value: undefined };
    }),
    onToolsChanged: vi.fn(() => () => {}),
    onClosed: vi.fn(() => () => {}),
    ...overrides,
  };
}

let bridge: ReturnType<typeof makeBridge>;

beforeEach(() => {
  bridge = makeBridge();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('connect', () => {
  it('invokes the connect channel', async () => {
    const host = createElectronMcpHost(bridge);
    await host.connect('srv-1', 'https://example.com/mcp', undefined, true);

    expect(bridge.invoke).toHaveBeenCalledWith(
      'mcp:connect',
      'srv-1',
      'https://example.com/mcp',
      undefined,
    );
  });

  it('does NOT forward proxyThroughLocal — Electron never proxies', async () => {
    const host = createElectronMcpHost(bridge);
    await host.connect('srv-1', 'https://example.com/mcp', undefined, true);

    const args = bridge.invoke.mock.calls[0];
    expect(args).toHaveLength(4);
  });

  it('marks the server connected in the local mirror', async () => {
    const host = createElectronMcpHost(bridge);
    expect(host.isConnected('srv-1')).toBe(false);
    await host.connect('srv-1', 'https://example.com/mcp', undefined, true);
    expect(host.isConnected('srv-1')).toBe(true);
  });

  it('leaves the mirror clear when connect fails', async () => {
    bridge.invoke = vi.fn(async () => ({
      ok: false,
      error: { code: 'E_CONNECT', message: 'refused' },
    }));
    const host = createElectronMcpHost(bridge);

    await expect(host.connect('srv-1', 'https://x/mcp', undefined, true)).rejects.toThrow(
      'refused',
    );
    expect(host.isConnected('srv-1')).toBe(false);
  });

  it('surfaces the error code', async () => {
    bridge.invoke = vi.fn(async () => ({
      ok: false,
      error: { code: 'E_CONNECT', message: 'refused' },
    }));
    const host = createElectronMcpHost(bridge);

    await expect(host.connect('srv-1', 'https://x/mcp', undefined, true)).rejects.toMatchObject({
      code: 'E_CONNECT',
    });
  });
});

describe('disconnect', () => {
  it('clears the mirror', async () => {
    const host = createElectronMcpHost(bridge);
    await host.connect('srv-1', 'https://x/mcp', undefined, true);
    await host.disconnect('srv-1');
    expect(host.isConnected('srv-1')).toBe(false);
  });
});

describe('connectStdio', () => {
  it('forwards the stdio config and env', async () => {
    const host = createElectronMcpHost(bridge);
    const stdio = { command: 'node', args: ['s.mjs'] };
    await host.connectStdio('srv-2', stdio, { FOO: 'bar' });

    expect(bridge.invoke).toHaveBeenCalledWith('mcp:connectStdio', 'srv-2', stdio, {
      FOO: 'bar',
    });
    expect(host.isConnected('srv-2')).toBe(true);
  });
});

describe('onToolsChanged', () => {
  it('only fires the handler for the matching server', async () => {
    let push: ((serverId: string) => void) | null = null;
    bridge.onToolsChanged = vi.fn((handler: (serverId: string) => void) => {
      push = handler;
      return () => {};
    });

    const host = createElectronMcpHost(bridge);
    const handler = vi.fn();
    host.onToolsChanged('srv-1', handler);

    push!('srv-2');
    expect(handler).not.toHaveBeenCalled();

    push!('srv-1');
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('listResources', () => {
  it('returns the resourceTemplates shape mcpClient expects', async () => {
    bridge.invoke = vi.fn(async () => ({
      ok: true,
      value: { resources: [{ uri: 'file:///a' }], resourceTemplates: [] },
    }));
    const host = createElectronMcpHost(bridge);

    const result = await host.listResources('srv-1');
    expect(result.resources).toHaveLength(1);
    expect(result.resourceTemplates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/host/electron/mcpElectron.test.ts`
Expected: FAIL — `Cannot find module './mcpElectron'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/host/electron/mcpElectron.ts`:

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
} from '../../../types';
import type { McpHost } from '../types';

export interface IpcFailure {
  ok: false;
  error: { code: string; message: string };
}
export interface IpcSuccess<T> {
  ok: true;
  value: T;
}
export type IpcEnvelope<T> = IpcSuccess<T> | IpcFailure;

export interface ElectronBridge {
  readonly kind: 'electron';
  invoke(channel: string, ...args: unknown[]): Promise<IpcEnvelope<unknown>>;
  onToolsChanged(handler: (serverId: string) => void): () => void;
  onClosed(handler: (serverId: string) => void): () => void;
}

/** Rethrow an IPC failure as an Error carrying `.code`. */
function unwrap<T>(envelope: IpcEnvelope<unknown>): T {
  if (envelope.ok) return envelope.value as T;
  const err = new Error(envelope.error.message) as Error & { code?: string };
  err.code = envelope.error.code;
  throw err;
}

export function createElectronMcpHost(bridge: ElectronBridge): McpHost {
  // `McpHost.isConnected` is synchronous, and the only synchronous IPC blocks the
  // renderer. Mirror the state locally instead, and let main correct it via `onClosed`.
  const connected = new Set<string>();

  bridge.onClosed((serverId) => connected.delete(serverId));

  async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
    return unwrap<T>(await bridge.invoke(channel, ...args));
  }

  return {
    async connect(serverId, url, auth: ServerAuth | undefined) {
      // proxyThroughLocal is intentionally dropped: main issues the request from
      // Node, so there is no CORS problem and nothing to proxy.
      await call<void>('mcp:connect', serverId, url, auth);
      connected.add(serverId);
    },

    async connectStdio(serverId, stdio: ServerStdioConfig, env) {
      await call<void>('mcp:connectStdio', serverId, stdio, env);
      connected.add(serverId);
    },

    async disconnect(serverId) {
      try {
        await call<void>('mcp:disconnect', serverId);
      } finally {
        connected.delete(serverId);
      }
    },

    isConnected(serverId) {
      return connected.has(serverId);
    },

    listTools(serverId) {
      return call<ToolDef[]>('mcp:listTools', serverId);
    },

    callTool(serverId, name, args) {
      return call<ToolResult>('mcp:callTool', serverId, name, args);
    },

    listResources(serverId) {
      return call<{ resources: ResourceEntry[]; resourceTemplates: ResourceTemplate[] }>(
        'mcp:listResources',
        serverId,
      );
    },

    readResource(serverId, uri) {
      return call<{ contents: ResourceContent[] }>('mcp:readResource', serverId, uri);
    },

    listPrompts(serverId) {
      return call<PromptDef[]>('mcp:listPrompts', serverId);
    },

    getPrompt(serverId, name, args) {
      return call<PromptMessage[]>('mcp:getPrompt', serverId, name, args);
    },

    onToolsChanged(serverId, handler) {
      return bridge.onToolsChanged((changedId) => {
        if (changedId === serverId) handler();
      });
    },
  };
}
```

Create `src/lib/host/electron/index.ts`:

```ts
import type { Host } from '../types';
import { browserFilesHost } from '../browser/filesBrowser';
import { createElectronMcpHost, type ElectronBridge } from './mcpElectron';

export function createElectronHost(bridge: ElectronBridge): Host {
  return {
    kind: 'electron',
    mcp: createElectronMcpHost(bridge),
    // Phase 2b replaces this with dialog.showSaveDialog over IPC. A blob download
    // in an Electron renderer still triggers Electron's own save dialog.
    files: browserFilesHost,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/host/electron/mcpElectron.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/host/electron/
git commit -m "feat(host): add Electron MCP host over the preload bridge"
```

---

## Task 8: Bridge detection in getHost()

**Files:**
- Modify: `src/lib/host/index.ts`
- Modify: `src/lib/host/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/host/index.test.ts`, inside the existing file (keep the current
`describe('getHost')` block as it is):

```ts
describe('bridge detection', () => {
  afterEach(() => {
    resetHost();
    vi.unstubAllGlobals();
  });

  it('picks the electron host when the preload bridge is present', () => {
    vi.stubGlobal('window', {
      mcpExplorer: {
        kind: 'electron',
        invoke: async () => ({ ok: true, value: undefined }),
        onToolsChanged: () => () => {},
        onClosed: () => () => {},
      },
    });

    expect(getHost().kind).toBe('electron');
  });

  it('falls back to the browser host when the bridge is absent', () => {
    vi.stubGlobal('window', {});
    expect(getHost().kind).toBe('browser');
  });

  it('falls back to the browser host when there is no window at all', () => {
    expect(getHost().kind).toBe('browser');
  });
});
```

Add `vi` to the vitest import at the top of that file:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/host/index.test.ts`
Expected: FAIL — the electron detection test reports `'browser'`.

- [ ] **Step 3: Write the implementation**

Replace the body of `src/lib/host/index.ts`:

```ts
import { browserHost } from './browser';
import { createElectronHost } from './electron';
import type { ElectronBridge } from './electron/mcpElectron';
import type { Host } from './types';

export type { FilesHost, Host, McpHost } from './types';

let current: Host | null = null;
let detected: Host | null = null;

declare global {
  interface Window {
    mcpExplorer?: ElectronBridge;
  }
}

function detect(): Host {
  const bridge = typeof window !== 'undefined' ? window.mcpExplorer : undefined;
  if (bridge && bridge.kind === 'electron') return createElectronHost(bridge);
  return browserHost;
}

/** The active host: the Electron bridge when present, otherwise the browser host. */
export function getHost(): Host {
  if (current) return current;
  if (!detected) detected = detect();
  return detected;
}

/** Install a host explicitly. Used by tests. */
export function setHost(host: Host): void {
  current = host;
}

/** Drop any explicitly installed host and re-run detection on next access. */
export function resetHost(): void {
  current = null;
  detected = null;
}
```

Note `resetHost` now clears the detection cache too, so a test that stubs `window`
after a previous `getHost()` call still gets a fresh decision.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/host/index.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole unit suite**

Run: `npm run build && npm test`
Expected: build clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/host/index.ts src/lib/host/index.test.ts
git commit -m "feat(host): detect the Electron preload bridge in getHost"
```

---

## Task 9: Error codes in connectionErrorMessage — RESOLVED, NO CODE CHANGE

**Status: complete.** Recorded here so the finding is not lost.

The Phase 1 plan flagged a hazard: `connectionErrorMessage.ts` uses
`instanceof UnauthorizedError` / `instanceof StreamableHTTPError`, and prototypes do not
survive IPC. Investigation showed the hazard is real but needs **no implementation
change**.

Coded errors fall through to the existing `err instanceof Error` branch, which calls
`formatGenericMessage(err.message)`. That function keys off the raw message text —
`econnrefused`, `spawn ... enoent`, `enotfound`, `etimedout` — so it produces the *same*
guidance in Electron as in the browser.

An earlier draft of this task added an `ipcErrorCode` helper that returned `err.message`
verbatim for any `E_*`-coded error. **Do not reintroduce it.** It bypassed every
guidance branch, so the Electron path produced strictly worse error text than the
browser path — raw `ECONNREFUSED 127.0.0.1:9999` instead of "Connection refused — No
program is listening at that address."

What actually shipped: a doc comment on `formatConnectionError` explaining why no
special case is needed, plus four tests in `src/lib/connectionErrorMessage.test.ts`
covering coded errors, including one asserting that a coded error formats **identically**
to the same error without a code.

---

## Task 10: Electron E2E suite

**Files:**
- Create: `playwright.electron.config.ts`
- Create: `tests/electron/helpers.ts`
- Create: `tests/electron/01-launch.spec.ts`
- Create: `tests/electron/02-http-direct.spec.ts`
- Create: `tests/electron/03-stdio-direct.spec.ts`

- [ ] **Step 1: Write the Playwright config**

This must be a separate config: `playwright.config.ts` binds a `webServer` to
`127.0.0.1:4173`, and its `tests/release/helpers.ts` assumes a passphrase prompt and an
HTTP origin. Create `playwright.electron.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: { trace: 'on-first-retry' },
  webServer: {
    // Only the MCP fixture — the Electron app serves its own renderer over app://.
    command: 'node tests/fixtures/http-mcp-server.mjs',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

- [ ] **Step 2: Write the helpers**

Create `tests/electron/helpers.ts`:

```ts
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURE_URL = 'http://localhost:3001/mcp';
export const VAULT_PASS = 'test-electron-pass-123';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}

/**
 * Launch the packaged-shape app against a throwaway userData dir, so each spec
 * starts with an empty vault and no leftover IndexedDB state.
 */
export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mcp-explorer-e2e-'));
  const app = await electron.launch({
    args: ['electron/main.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, MCP_EXPLORER_E2E: '1' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userDataDir };
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
  await launched.app.close();
  rmSync(launched.userDataDir, { recursive: true, force: true });
}

/** Phase 2a still uses the passphrase vault; 2b replaces this with auto-unlock. */
export async function setupVault(page: Page): Promise<void> {
  await page.getByLabel('Passphrase', { exact: true }).fill(VAULT_PASS);
  await page.getByLabel('Confirm passphrase').fill(VAULT_PASS);
  await page.getByRole('button', { name: 'Create vault' }).click();
  await page.getByRole('button', { name: 'Add' }).waitFor({ timeout: 15_000 });
}

export async function addHttpServer(page: Page, name: string, url: string): Promise<void> {
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('MCP HTTP URL').clear();
  await page.getByLabel('MCP HTTP URL').fill(url);
  await page.getByRole('button', { name: 'Add & connect' }).click();
}

export async function waitForConnected(page: Page, name: string): Promise<void> {
  await page
    .locator('aside li')
    .filter({ hasText: name })
    .locator('.bg-emerald-400')
    .waitFor({ timeout: 20_000 });
}
```

- [ ] **Step 3: Write the launch spec**

Create `tests/electron/01-launch.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { closeApp, launchApp, type LaunchedApp } from './helpers';

test.describe.serial('Electron — launch', () => {
  let launched: LaunchedApp;
  const consoleErrors: string[] = [];

  test.beforeAll(async () => {
    launched = await launchApp();
    launched.page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  });

  test.afterAll(async () => closeApp(launched));

  test('window opens and renders the app', async () => {
    await expect(launched.page.locator('h1')).toContainText('MCP Explorer', {
      timeout: 15_000,
    });
  });

  test('renderer is served over the app:// origin', async () => {
    const url = launched.page.url();
    expect(url.startsWith('app://')).toBe(true);
  });

  test('the preload bridge is exposed and frozen', async () => {
    const info = await launched.page.evaluate(() => ({
      kind: (window as unknown as { mcpExplorer?: { kind?: string } }).mcpExplorer?.kind,
      frozen: Object.isFrozen((window as unknown as { mcpExplorer?: object }).mcpExplorer),
    }));

    expect(info.kind).toBe('electron');
    expect(info.frozen).toBe(true);
  });

  test('the renderer has no Node access', async () => {
    const leaked = await launched.page.evaluate(
      () =>
        typeof (globalThis as Record<string, unknown>).require !== 'undefined' ||
        typeof (globalThis as Record<string, unknown>).process !== 'undefined',
    );
    expect(leaked).toBe(false);
  });

  test('non-allow-listed IPC channels are blocked', async () => {
    const message = await launched.page.evaluate(async () => {
      const bridge = (window as unknown as {
        mcpExplorer: { invoke: (c: string) => Promise<unknown> };
      }).mcpExplorer;
      try {
        await bridge.invoke('mcp:evil');
        return 'allowed';
      } catch (err) {
        return (err as Error).message;
      }
    });

    expect(message).toContain('Blocked IPC channel');
  });

  test('no console errors during startup', () => {
    expect(consoleErrors).toEqual([]);
  });
});
```

- [ ] **Step 4: Write the direct-HTTP spec**

Create `tests/electron/02-http-direct.spec.ts`. The point of this spec is that the
connection succeeds with **no** local server running — proving the request left from
Node with no proxy involved.

```ts
import { test, expect } from '@playwright/test';
import {
  addHttpServer,
  closeApp,
  FIXTURE_URL,
  launchApp,
  setupVault,
  waitForConnected,
  type LaunchedApp,
} from './helpers';

test.describe.serial('Electron — direct HTTP transport', () => {
  let launched: LaunchedApp;
  const requestedUrls: string[] = [];

  test.beforeAll(async () => {
    launched = await launchApp();
    launched.page.on('request', (req) => requestedUrls.push(req.url()));
    await setupVault(launched.page);
    await addHttpServer(launched.page, 'Fixture', FIXTURE_URL);
    await waitForConnected(launched.page, 'Fixture');
  });

  test.afterAll(async () => closeApp(launched));

  test('connects and lists tools', async () => {
    await launched.page.getByRole('button', { name: /^Tools/ }).click();
    await expect(
      launched.page.locator('aside + aside ul li').filter({ hasText: /./ }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('the renderer never issued a proxy request', () => {
    expect(requestedUrls.filter((u) => u.includes('__mcp_proxy'))).toEqual([]);
  });

  test('invoking a tool returns a result', async () => {
    await launched.page.locator('aside + aside').getByText('echo_markdown').first().click();
    await launched.page.getByLabel('message').fill('hello from electron');
    await launched.page.getByRole('button', { name: /run|invoke|call/i }).first().click();

    await expect(launched.page.getByText('hello from electron').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
```

- [ ] **Step 5: Write the direct-stdio spec**

Create `tests/electron/03-stdio-direct.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { closeApp, launchApp, setupVault, waitForConnected, type LaunchedApp } from './helpers';
import { resolve } from 'node:path';

test.describe.serial('Electron — direct stdio transport', () => {
  let launched: LaunchedApp;
  const requestedUrls: string[] = [];

  test.beforeAll(async () => {
    launched = await launchApp();
    launched.page.on('request', (req) => requestedUrls.push(req.url()));
    await setupVault(launched.page);

    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill('Stdio');
    await page.getByRole('button', { name: /^Stdio$/ }).click();
    await page.getByLabel('Command').fill(process.execPath);
    await page
      .getByLabel('Arguments')
      .fill(resolve('tests/fixtures/stdio-mcp-server.mjs'));
    await page.getByRole('button', { name: 'Add & connect' }).click();
    await waitForConnected(page, 'Stdio');
  });

  test.afterAll(async () => closeApp(launched));

  test('spawns the subprocess and lists its tools', async () => {
    await launched.page.getByRole('button', { name: /^Tools/ }).click();
    await expect(launched.page.locator('aside + aside').getByText('echo')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('the renderer never touched the stdio HTTP bridge', () => {
    expect(requestedUrls.filter((u) => u.includes('__mcp_stdio'))).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the Electron suite**

Run: `xvfb-run -a npx playwright test --config playwright.electron.config.ts`
Expected: all specs pass.

If the app window never appears, drop `xvfb-run` — WSLg supplies `DISPLAY=:0` and the
nested X server is not always needed.

The selectors in specs 02 and 03 are copied from the patterns in
`tests/release/helpers.ts` and `tests/release/22-stdio-transport.spec.ts`. If a label
does not match, read those files and use the real one rather than guessing.

- [ ] **Step 7: Commit**

```bash
git add playwright.electron.config.ts tests/electron/
git commit -m "test(electron): add end-to-end suite for launch and direct transports"
```

---

## Task 11: Prove the browser path is still intact

**Files:** none modified.

- [ ] **Step 1: Confirm the release specs are untouched**

Run: `git status --short tests/release/`
Expected: no output.

- [ ] **Step 2: Run the browser release suite**

Run: `npx playwright test tests/release/`
Expected: 99 passed.

Specs §3.6 and §3.12 additionally reach an external MCP server on the LAN
(`AWESOME_URL` in `tests/release/helpers.ts`). If those two fail, check that host is
reachable before assuming a regression.

- [ ] **Step 3: Confirm the browser host is still selected on the web**

Run: `npm test -- src/lib/host/index.test.ts`
Expected: PASS — including the "falls back to the browser host when the bridge is
absent" case.

- [ ] **Step 4: Confirm no Electron import leaked into the renderer bundle**

Run: `grep -rn "from 'electron'" src/`
Expected: no output. The renderer must only ever reach Electron through
`window.mcpExplorer`.

- [ ] **Step 5: Commit any fixes**

If Steps 1-4 required no changes there is nothing to commit.

---

## Definition of done

- [ ] `npm run build`, `npm run lint`, and `npm test` all pass.
- [ ] `npx playwright test tests/release/` passes 99/99 with `tests/release/` unmodified.
- [ ] `xvfb-run -a npx playwright test --config playwright.electron.config.ts` passes.
- [ ] `grep -rn "from 'electron'" src/` returns nothing.
- [ ] `npm run electron:start` opens a window that connects to an HTTP MCP server with
      the proxy toggle **off** and to a stdio server, with no local static server running.
- [ ] `src/lib/mcpClient.ts` and `src/lib/protocolTrace.ts` are unmodified by this phase.
- [ ] `electron` appears only in `devDependencies`.

Documentation (`README.md`, `README.npm.md`, `CLAUDE.md`, `SKILL.md`) is updated in
Phase 3 alongside packaging, when the desktop app becomes something a user can download.
