# MCP Explorer — Agent Rules

## What This Project Is

MCP Explorer is a **Vite + React + TypeScript browser app** that connects to MCP (Model Context
Protocol) servers over streamable HTTP. Users add any MCP HTTP endpoint; the app auto-connects,
lists all tools, and generates input forms so you can invoke any tool interactively. It also
exposes prompts, resources, and a suite of developer tooling (Protocol Inspector, Schema Lab,
Replay Suites, Scenario Runner, Agent Readiness scoring).

The app ships as an npm CLI package (`@orenvill/mcp-explorer`) and as a self-contained static
build. The CLI (`bin/mcp-explorer.js`) runs a zero-dep Node static server (`server.js`) and
opens the browser. A local proxy (`proxy.js`) rewrites browser MCP requests to bypass CORS,
and two IPC-style file handlers (`vault-file-handler.js`, `app-data-handler.js`) are intercepted
by the static server for secrets and app-data persistence.

**Tech stack:**
- Vite 8 + React 19 + TypeScript 6
- `@modelcontextprotocol/sdk` — browser MCP client + `StreamableHTTPClientTransport`
- Tailwind CSS v4 via `@tailwindcss/vite`
- Vitest for unit tests (`npm test`)
- Playwright for end-to-end release suite (`npm run test:e2e`)

---

## Project Architecture

The app uses a **3-column layout** (server list | tool/resource/prompt list | detail + result).
`App.tsx` owns all top-level state and wires together the three columns. All business logic lives
in focused, independently testable modules under `src/lib/`. React components under
`src/components/` handle rendering only — they should not own significant logic.

```
src/
├── App.tsx                       # top-level state owner; 3-column layout
├── types.ts                      # ServerEntry, ToolDef, ToolResult, JSON Schema types
│
├── components/                   # UI-only React components
│   ├── ServerList.tsx            # left column: add/edit/remove servers, connect/disconnect
│   ├── ServerFormDialog.tsx      # modal: add/edit server (name, URL, proxy toggle, auth)
│   ├── DiscoveryHeader.tsx       # meta-tool discovery banner and one-click trigger
│   ├── DiscoveredToolsSection.tsx # collapsible list of tools found via meta-tool discovery
│   ├── DiscoveryProgress.tsx     # step-by-step progress indicator during discovery
│   ├── ToolList.tsx              # middle column: Tools / Resources / Prompts tabs + search
│   ├── ToolDetail.tsx            # right column: tool form + result display
│   ├── SchemaForm.tsx            # JSON Schema → auto-generated form (string, number, bool, enum, JSON)
│   ├── ResultPane.tsx            # renders MCP tool call results (text, images, structured JSON)
│   ├── ResourceList.tsx          # MCP resources tab list
│   ├── ResourceDetail.tsx        # MCP resource content viewer
│   ├── PromptList.tsx            # MCP prompts tab list
│   ├── PromptDetail.tsx          # MCP prompt argument form + message preview
│   ├── CallHistory.tsx           # per-server call history timeline
│   ├── GlobalSearch.tsx          # cross-server tool search overlay
│   ├── ExportDialog.tsx          # client-config export modal (Claude Desktop / Cursor JSON)
│   ├── DevToolsModal.tsx         # tabbed dev-tools drawer (see Dev Tools section)
│   ├── ProtocolInspectorPanel.tsx # Protocol Inspector tab
│   ├── ReplaySuitesPanel.tsx     # Replay Suites tab
│   ├── SchemaLabPanel.tsx        # Schema Lab tab
│   ├── ScenarioRunnerPanel.tsx   # Scenario Runner tab
│   ├── AgentReadinessPanel.tsx   # Agent Readiness tab
│   ├── AgentReadinessBadge.tsx   # score badge shown in server header
│   ├── VaultSetup.tsx            # first-time vault password setup
│   ├── VaultUnlock.tsx           # vault unlock prompt
│   ├── VaultLockButton.tsx       # toolbar lock/unlock toggle
│   ├── CodeBlock.tsx             # syntax-highlighted code display (shiki)
│   ├── MarkdownPreview.tsx       # renders markdown content (marked)
│   ├── Logo.tsx                  # SVG logo used in navbar and favicon
│   └── useProtocolTraces.ts      # React hook subscribing to protocol trace events
│
└── lib/                          # pure business-logic modules — testable in isolation
    ├── mcpClient.ts              # MCP Client + StreamableHTTPClientTransport; auth headers;
    │                             #   proxy URL builder; per-server connect/disconnect/invoke
    ├── protocolTrace.ts          # in-memory MCP call event store; redacts auth material;
    │                             #   max 200 events; push/subscribe pattern
    ├── protocolDiff.ts           # diff two protocol call payloads (for call history view)
    ├── storage.ts                # localStorage persistence for the server list
    ├── appData.ts                # bookmarks + call history; prefers /__app_data file API,
    │                             #   falls back to localStorage
    ├── history.ts                # CallRecord types + ring-buffer management
    ├── bookmarks.ts              # bookmark CRUD helpers
    ├── replaySuites.ts           # capture and replay sets of MCP tool calls
    ├── scenarioRunner.ts         # execute ordered multi-step call chains (scenarios)
    ├── schemaLab.ts              # schema analysis: required fields, example generation,
    │                             #   JSON-RPC tools/call payload copy
    ├── clientConfigExport.ts     # generate claude_desktop_config.json and Cursor JSON
    ├── handoffReadme.ts          # generate a "handoff" README describing a server's tools
    ├── agentReadiness.ts         # score a server 0–100 for agent-readiness heuristics
    ├── connectionErrorMessage.ts # user-facing error message formatter for connect failures
    ├── highlighter.ts            # syntax highlighting (shiki) helper
    ├── promptSerialize.ts        # serialize MCP prompt messages for display
    ├── uriTemplate.ts            # RFC 6570 URI template expansion
    ├── export.ts                 # JSON round-trip import/export helpers
    │
    ├── discovery/                # multi-strategy meta-tool discovery engine
    │   ├── orchestrator.ts       # drives strategies in order, deduplicates results
    │   ├── detect.ts             # classify whether a tool looks like a meta-tool
    │   ├── invoke.ts             # invoke a meta-tool and normalize its response
    │   ├── parse.ts              # parse raw discovery results into ToolDef[]
    │   ├── constants.ts          # known meta-tool name patterns
    │   └── strategies/           # bulkList, category, enableCapability, hybrid strategies
    │
    └── vault/                    # encrypted credential storage (Web Crypto AES-GCM)
        ├── service.ts            # high-level vault API: init, lock, unlock, read, write
        ├── crypto.ts             # AES-GCM encrypt/decrypt helpers
        ├── envelope.ts           # PBKDF2 key derivation + envelope serialization
        ├── idb.ts                # IndexedDB persistence for the vault blob
        ├── vaultPersistence.ts   # /__vault_file bridge (file-backed persistence)
        ├── types.ts              # vault domain types
        └── constants.ts          # PBKDF2 iteration count and key-derivation parameters
```

---

## Server-Side Boundaries

Everything outside `src/` runs in Node and is intentionally minimal. Do not add new
functionality here unless it fits one of these existing boundaries.

| File | Purpose |
|------|---------|
| `server.js` | Zero-dep static file server for `dist/`. Proper MIME types, immutable cache headers for hashed assets, SPA fallback. Intercepts `/__mcp_proxy`, `/__app_data`, `/__vault_file`. |
| `proxy.js` | Rewrites browser MCP requests to real MCP server URLs; adds CORS headers. Called by `server.js`. |
| `app-data-handler.js` | Reads/writes `mcp-explorer-data.json` alongside the binary for bookmarks + history persistence outside the browser sandbox. |
| `vault-file-handler.js` | Reads/writes the encrypted vault blob to disk (non-browser persistence). |
| `bin/mcp-explorer.js` | CLI entry: builds if needed → starts `server.js` as a daemon → opens browser → handles `mcp-explorer stop`. |
| `daemon-lock.js` | PID lock-file management for the CLI daemon process. |

---

## Persistence Model

| Store | Mechanism | What lives there |
|-------|-----------|-----------------|
| Server list | `localStorage` key `mcp-explorer:servers` | Server URLs, names, proxy toggle, connection state |
| Bookmarks | `appData` → `/__app_data` file, or `localStorage` fallback | Bookmarked tool call IDs |
| Call history | `appData` → `/__app_data` file, or `localStorage` fallback | Ring buffer of recent tool calls |
| Credentials | Encrypted vault → IndexedDB + `/__vault_file` | API keys, bearer tokens, Basic auth (AES-GCM encrypted) |
| Protocol traces | In-memory only (never persisted) | MCP call timeline for the current session |
| Replay suites | In-memory + optional JSON export | Captured call sets for replay |

**Rule:** Keep persisted secrets inside the encrypted vault flow. Do not add new plaintext
credential storage anywhere in the codebase.

---

## Dev Tools Modal

A slide-over drawer opened from the toolbar. Each tab is a distinct panel component backed by
a focused `src/lib/` module. New features that inspect MCP runtime behavior or tool schemas
belong here — not in the main 3-column layout.

| Tab | Component | Logic module | What it does |
|-----|-----------|-------------|--------------|
| Protocol Inspector | `ProtocolInspectorPanel` | `protocolTrace.ts` | Live MCP call timeline: method, params, result/error, status, duration. Data flows: `mcpClient.ts` → `protocolTrace.ts` → `useProtocolTraces.ts` hook → panel. Never records auth material. |
| Schema Lab | `SchemaLabPanel` | `schemaLab.ts` | Read-only tool schema analysis: required fields, example argument generation, JSON-RPC `tools/call` copy. |
| Replay Suites | `ReplaySuitesPanel` | `replaySuites.ts` | Capture sets of MCP tool calls and replay them. Supports diff between runs. |
| Scenario Runner | `ScenarioRunnerPanel` | `scenarioRunner.ts` | Execute ordered multi-step call chains with parameter threading between steps. |
| Agent Readiness | `AgentReadinessPanel` | `agentReadiness.ts` | Scores a connected server 0–100 across heuristics (tool descriptions, schema quality, error surfaces, etc.). Badge shown in server header. |

---

## Implementation Standards

### Component split

- `App.tsx` owns top-level state. Do not grow it — route new behavior through `src/lib/` modules.
- `src/components/*` renders UI. Components should not own significant business logic.
- `src/lib/*` owns reusable, testable behavior. Every non-trivial module gets a `*.test.ts` file.

### Test-Driven Development

Use TDD for all new behavior in `src/lib/`:
1. Write a focused failing test in the matching `*.test.ts` file.
2. Run `npm test -- <file>` to confirm the failure.
3. Implement the smallest change that makes it pass.
4. Refactor, then run the full suite (`npm test`).

### Dependency policy

Do not introduce new npm dependencies when existing Web APIs, React, TypeScript, or project
helpers are enough. The server-side files have zero runtime dependencies — keep them that way.

### Auth material

Never record authentication material in any debugging view or log. `protocolTrace.ts` redacts
payloads by matching key names against
`/authorization|api[-_]?key|token|secret|password|bearer/i`.

### File focus

When a file grows large, it is usually doing too much. Break it into smaller units with clear
single responsibilities and well-defined interfaces.

### After substantive edits

Run targeted tests first, then the full suite:
```bash
npm test -- src/lib/<module>.test.ts   # targeted fast check
npm run build                           # tsc -b + vite build
npm run lint                            # eslint
npm test                                # full vitest suite
```

---

## Playwright Release Suite

End-to-end tests live in `tests/release/` (21 spec files, ~95 tests). They run against the
**built `dist/`** served by `server.js` at `http://127.0.0.1:4173`. A fixture MCP server must
be running at `http://localhost:3001/mcp` for live-connection tests (specs 05 onward).

Run the full suite with:
```bash
npx playwright test tests/release/
```

Spec numbering maps directly to release checklist sections:

| Spec | Area |
|------|------|
| `01` | Initial load, empty state |
| `02` | Add server dialog |
| `03` | Connection error messages |
| `04` | Tab bar navigation |
| `05` | Live fixture server connection |
| `06` | Tool input forms (all field types) |
| `07` | Result pane rendering |
| `08` | Call history diff view |
| `09` | Bookmarks persistence |
| `10` | Cross-server global search |
| `11` | Export dialog (JSON) |
| `12` | Meta-tool discovery |
| `13` | Resources tab |
| `14` | Prompts tab |
| `15` | Protocol Inspector |
| `16` | Replay Suites |
| `17` | Schema Lab |
| `18` | Agent Readiness scoring |
| `19` | Client Config Export |
| `20` | Handoff README generation |
| `21` | Scenario Runner |

---

## Release Checklist Must Stay Current

`.cursor/skills/prepare-for-release/SKILL.md` is the project release gate — not optional
documentation.

Whenever a **user-visible feature, workflow, CLI behavior, storage behavior, or
release-risky regression area changes**, do all three of the following in the same branch:

### 1. Add or update Playwright tests in `tests/release/`

This is the primary deliverable. For every changed behavior, write or update the
corresponding spec in `tests/release/`:
- Which spec file covers this area? Add to it, or create a new numbered spec.
- **What to navigate to:** starting URL, sidebar item to click.
- **What to interact with:** button clicks, form fills, modal triggers — use `page.getByRole`,
  `page.getByText`, or `page.locator` with stable selectors.
- **What to assert:** visible text, element visibility/state, network requests where relevant.
- **Fixture server requirements:** if the test needs a specific tool type or capability, note
  it with a `test.skip` guard using the standard helpers in `tests/release/helpers.ts`.

A new user-visible feature **without a Playwright test is a release blocker.**

### 2. Update the release skill

Update `SKILL.md` to reference the new or changed test section number, describe what a
manual pass looks like (what to observe, what failures block release), and update the
total test count if it changed.

### 3. Keep docs aligned

If `README.md` or `README.npm.md` describes the changed behavior (commands, features,
workflows), update them in the same branch.
