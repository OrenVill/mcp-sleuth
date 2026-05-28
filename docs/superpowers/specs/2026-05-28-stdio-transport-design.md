# Stdio MCP Transport — Design Spec

**Date:** 2026-05-28  
**Status:** Approved  
**Branch:** `feat/stdio-transport` (implementation)

## Summary

Add **stdio** as a second server transport alongside HTTP. Users pick **HTTP** or **Stdio** in Add/Edit server. Stdio servers spawn a local subprocess (command + args + cwd + env); the browser continues to use the MCP SDK **HTTP client** against a **local Streamable HTTP facade** exposed by Node. The facade delegates to a Node-held MCP client on `StdioClientTransport`.

Stdio works when the app is served by **`server.js` / `mcp-explorer` CLI** and during **`npm run dev`** (Vite middleware), using the same bridge handler in both places.

## Goals

- Connect to MCP servers that only speak stdio (Cursor/Claude-style `command` / `args` / `env`).
- Reuse existing UI: tool forms, resources, prompts, dev tools, protocol inspector, discovery, etc.
- Persist non-secret stdio config in the server list; **env values in the encrypted vault** (same trust model as HTTP auth).
- Export client configs with correct stdio shape and `${env:…}` placeholders for secrets.
- Bridge uses existing **`@modelcontextprotocol/sdk`** dependency (already in `package.json` `dependencies`; available to global CLI installs).

## Non-goals (v1)

- Importing stdio entries from `~/.cursor/mcp.json` (manual form only).
- Running stdio when the UI is opened as **static files without** `server.js` or Vite (show a clear error).
- Remote stdio (SSH, Docker) — local spawn only.
- Custom stderr UI (child stderr uses SDK default `inherit`).

---

## 1. Data model & persistence

### `ServerEntry` / `StoredServer`

```ts
export type ServerTransport = 'http' | 'stdio';

export interface ServerStdioConfig {
  command: string;
  args: string[];
  cwd?: string;
  /** Env var names only — values live in `stdioEnv` (vault). */
  envKeys?: string[];
}

export interface ServerEntry {
  // ...existing fields...
  transport?: ServerTransport; // default 'http' when missing (migration)
  stdio?: ServerStdioConfig;
  /** Secret env values; encrypted via vault with the server list. */
  stdioEnv?: Record<string, string>;
}
```

| Transport | Persisted fields | Vault |
|-----------|------------------|-------|
| `http` | `url`, `auth?`, `proxyThroughLocal?` | `auth` secrets in vault blob |
| `stdio` | `stdio.command`, `stdio.args`, `stdio.cwd?`, `stdio.envKeys?` | `stdioEnv` map in vault blob |

- **HTTP servers:** unchanged behavior.
- **Stdio servers:** `url` may be omitted or set to a stable placeholder for legacy code paths; runtime derives bridge URL (see §3). Do not persist the synthetic bridge URL.
- **Migration:** `load` / `fromStoredServers` treats missing `transport` as `'http'`.

### Args encoding

- UI: textarea, **one argument per line**, trim lines, drop empties → `string[]`.
- No shell parsing.

### Env encoding

- UI: key/value rows (add/remove rows) + optional “paste JSON object” helper if useful later; v1 key/value list is enough.
- Keys listed in `stdio.envKeys` for export ordering; values only in `stdioEnv`.

---

## 2. UI (Add/Edit server)

### Transport selector

- Radio or segmented control: **HTTP** | **Stdio** at top of dialog.
- Switching transport resets incompatible fields (with confirm if user edited).

### HTTP panel (existing)

- URL, proxy toggle, auth — unchanged.

### Stdio panel

| Field | Control |
|-------|---------|
| Command | text input (required) |
| Arguments | textarea, one per line |
| Working directory | optional text input |
| Environment | key/value list; values masked like passwords |
| Name, description | unchanged |

- Hide: URL, proxy, HTTP auth.
- Validation: `command` non-empty; `args` may be empty array; `cwd` if set must be non-empty string; env keys unique.

### Server list / header

- Badge or subtitle: `stdio` vs `http` (e.g. `npx …` truncated command).
- Connection errors use stdio-specific messages (§6).

---

## 3. Architecture: stdio bridge (Node)

### Module: `stdio-bridge.js` (zero extra runtime deps; uses project SDK from `node_modules`)

**Registry:** `Map<serverId, Session>` where `Session` holds:

- `StdioClientTransport` + MCP `Client` (connected to child MCP server)
- MCP `Server` facade + `StreamableHTTPServerTransport`
- Child PID, startedAt

### Lifecycle

1. **Start session** — `POST /__mcp_stdio/:serverId/start`  
   Body: `{ command, args, cwd?, env? }` (env merged server-side; secrets from request body on connect only, not logged).  
   - If session exists for `serverId`, stop previous child first.  
   - Spawn via `StdioClientTransport`, `client.connect(transport)`.  
   - Start facade `Server` that forwards: `initialize`, `tools/list`, `tools/call`, `resources/*`, `prompts/*`, etc., to the stdio `Client`.  
   - Wire notification forwarding (e.g. `tools/list_changed`) from stdio client → facade server → HTTP transport.  
   - Idempotent: same `serverId` replaces session.

2. **MCP over HTTP** — `GET|POST /__mcp_stdio/:serverId/mcp`  
   - Delegates to `StreamableHTTPServerTransport.handleRequest(req, res)` for that session.  
   - Returns **404/503** if session not started.

3. **Stop session** — `DELETE /__mcp_stdio/:serverId`  
   - Close HTTP transport, client, kill child.  
   - Called on disconnect and before replace.

4. **Process exit** — On unexpected child exit, mark session dead; next browser request returns actionable error; UI shows disconnect/error state.

### Security

- Handlers only on **localhost** server (existing `127.0.0.1` bind).
- `serverId` must match `/^[a-zA-Z0-9_-]+$/` (same as stored ids).
- Env: merge with SDK `getDefaultEnvironment()`; do not log env values in server console.
- **No** auth headers on stdio bridge routes (local session only).

### Browser connection URL

```ts
function stdioBridgeMcpUrl(serverId: string, baseOrigin = window.location.origin): string {
  return `${baseOrigin}/__mcp_stdio/${encodeURIComponent(serverId)}/mcp`;
}
```

`proxyThroughLocal` is **ignored** for stdio (always same-origin bridge).

---

## 4. Browser `mcpClient` + `App` connect flow

### `connect(serverId, …)` changes

For stdio servers (`App.handleConnect`):

1. `POST …/start` with `{ command, args, cwd, env: stdioEnv }`.
2. `connect(serverId, stdioBridgeMcpUrl(serverId), undefined, false)` — existing Streamable HTTP client path.

For HTTP: unchanged.

### `disconnect(serverId)`

1. Existing `client.close()` / transport close.
2. If stdio: `DELETE /__mcp_stdio/:serverId`.

### `handleConnect` signature

Extend optional `connection` payload:

```ts
connection?: {
  transport: ServerTransport;
  url?: string;
  auth?: ServerAuth;
  proxyThroughLocal?: boolean;
  stdio?: ServerStdioConfig;
  stdioEnv?: Record<string, string>;
};
```

### Protocol trace

- Stdio traffic appears as HTTP to `/__mcp_stdio/...` in the inspector (acceptable v1).
- Optional: tag traces with `transport: 'stdio'` in `initialize` params (no secrets).

---

## 5. Dev vs production wiring

| Runtime | Integration |
|---------|-------------|
| `server.js` | Route `/__mcp_stdio/*` to `stdio-bridge.js` before static files (like `/__mcp_proxy`). |
| `vite.config.ts` | `configureServer` + `configurePreviewServer` middleware for same paths. |
| `npm run dev` | Required — same middleware as proxy. |

If `POST /start` returns 404 (no bridge), `formatConnectionError` suggests running via `mcp-explorer` or `npm run dev`, not opening `dist/index.html` directly.

**Package publish:** add `stdio-bridge.js` to `package.json` `"files"` array.

---

## 6. Client config export

Update `clientConfigExport.ts` for stdio inputs:

| Client | Stdio shape |
|--------|-------------|
| Cursor | `{ "command", "args", "env"? }` under `mcpServers[slug]` |
| Claude Desktop | `{ "type": "stdio", "command", "args", "env"? }` |
| VS Code | `{ "type": "stdio", "command", "args", "env"? }` under `servers` |

- Env values → `${env:SLUG_KEY}` placeholders (reuse `envVar()` helper pattern).
- HTTP export unchanged when `transport === 'http'`.

---

## 7. Errors & edge cases

| Case | User-facing behavior |
|------|----------------------|
| Command not found | “Could not start process: …” |
| Child exits immediately | Show stderr hint in error (if captured) + check command/args |
| Bridge not available | “Stdio requires the local explorer server (npm run dev or mcp-explorer)” |
| Port busy / start fails | Surface Node error message sanitized |
| Edit stdio while connected | Disconnect first or block save with message |
| Vault locked | Cannot connect stdio servers needing `stdioEnv` until unlock |

`connectionErrorMessage.ts`: add formatters for bridge HTTP errors and spawn failures.

---

## 8. Testing

### Unit (Vitest)

- `stdio-bridge.js`: session start/stop, id validation, replace session, env merge (mock spawn if needed).
- `transportUrl` / `stdioBridgeMcpUrl` helpers.
- `clientConfigExport`: stdio snippets + redacted env.
- `ServerFormDialog` validation (args lines → array).

### Playwright (`tests/release/`)

- New section **§3.22** (or extend §02): add stdio server using a **minimal stdio fixture** (`tests/fixtures/stdio-mcp-server.mjs` — tiny MCP server over stdio).
- Assert: connect, tools list, invoke one tool.
- Requires local dev server (same as other live tests).

### Release skill

- Update `.cursor/skills/prepare-for-release/SKILL.md` test count and §3.22 manual pass.

---

## 9. File touch list (implementation reference)

| Area | Files |
|------|-------|
| Bridge | `stdio-bridge.js` (new), `server.js`, `vite.config.ts` |
| Types / storage | `src/types.ts`, `src/lib/storage.ts`, `App.tsx` (`fromStored`/`toStored`) |
| Client | `src/lib/mcpClient.ts`, `src/lib/stdioSession.ts` (new, start/stop fetch) |
| UI | `src/components/ServerFormDialog.tsx`, `ServerList.tsx` |
| Export | `src/lib/clientConfigExport.ts` + tests |
| Errors | `src/lib/connectionErrorMessage.ts` + tests |
| Fixture | `tests/fixtures/stdio-mcp-server.mjs` |
| E2E | `tests/release/22-stdio-transport.spec.ts` (new) |
| Docs | `README.md`, `README.npm.md` |

---

## 10. Approaches considered

| Approach | Verdict |
|----------|---------|
| **Streamable HTTP facade** (chosen) | Reuses browser MCP client and dev tools |
| Custom REST RPC per method | Rejected — duplication and notification gaps |
| Browser-only stdio | Impossible — no subprocess API |

---

## Open questions (resolved)

| Question | Decision |
|----------|----------|
| Runtimes | `server.js` + Vite dev |
| Add flow | UI transport toggle |
| Stdio fields | command, args, cwd, env |
| Env secrets | Vault (`stdioEnv`) |
| Args UI | One per line |
| Export | Full stdio with env placeholders |
