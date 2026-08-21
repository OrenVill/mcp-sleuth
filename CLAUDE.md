# Sleuth — Agent Rules

## What This Project Is

Sleuth is a **Vite + React + TypeScript app** that connects to MCP (Model Context Protocol)
servers over streamable HTTP or stdio. Users add any MCP endpoint; the app auto-connects, lists
all tools, and generates input forms so you can invoke any tool interactively. It also exposes
prompts, resources, and a suite of developer tooling (Protocol Inspector, Schema Lab, Replay
Suites, Scenario Runner, Agent Readiness scoring, trust evaluators).

The same renderer ships three ways:

1. **Browser, from source** — `npm run dev`.
2. **CLI** — the npm package `@orenvill/mcp-sleuth`. `bin/mcp-sleuth.js` runs a zero-dep Node
   static server (`server.js`) and opens the browser. A local proxy (`proxy.js`) rewrites browser
   MCP requests to bypass CORS, `stdio-bridge.js` fronts stdio subprocesses over same-origin
   HTTP, and two IPC-style file handlers (`vault-file-handler.js`, `app-data-handler.js`) are
   intercepted by the static server for secrets and app-data persistence. This is the only option
   for remote/SSH use.
3. **Desktop app** — Electron, from the `electron/` tree, packaged by `electron-builder`. MCP
   traffic leaves the main process, so there is no CORS proxy and stdio servers are spawned
   directly with no HTTP bridge. Adds OS-keychain vault auto-unlock and native save dialogs.

**Tech stack:**
- Vite 8 + React 19 + TypeScript 6
- `@modelcontextprotocol/sdk` — MCP client + `StreamableHTTPClientTransport` / `StdioClientTransport`
- Tailwind CSS v4 via `@tailwindcss/vite`
- Electron + `electron-builder` for the desktop build (devDependencies only — `package.json`
  deliberately has **no `main` field**; the packaged entry is injected via `extraMetadata.main`)
- Vitest for unit tests (`npm test`)
- Playwright for the browser release suite (`npx playwright test tests/release/`) and the
  Electron suite (`npm run test:e2e:electron`)

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
│   ├── ServerBrowser.tsx         # middle-column shell: Tools/Resources/Prompts tab switch
│   ├── ExportDialog.tsx          # client-config export modal (Claude Desktop / Cursor JSON)
│   ├── DevToolsModal.tsx         # tabbed dev-tools drawer (see Dev Tools section)
│   ├── ProtocolInspectorPanel.tsx # Protocol Inspector tab
│   ├── ReplaySuitesPanel.tsx     # Replay Suites tab
│   ├── SchemaLabPanel.tsx        # Schema Lab tab
│   ├── ScenarioRunnerPanel.tsx   # Scenario Runner overlay (opened from App.tsx, not a tab)
│   ├── AgentReadinessPanel.tsx   # Agent Readiness tab
│   ├── PermissionSurfacePanel.tsx # Permission Surface tab
│   ├── PromptInjectionPanel.tsx  # Prompt Injection scan tab
│   ├── ObservationJournalPanel.tsx # Observation Journal tab
│   ├── AgentReadinessBadge.tsx   # score badge shown in server header
│   ├── UpdateBanner.tsx          # desktop-only "a new version is out" strip under the header
│   ├── VersionPill.tsx           # header version label + update popover (check now, auto-check)
│   ├── useUpdateStatus.ts        # React hook over the host's updates group
│   ├── VaultSetup.tsx            # first-time vault password setup
│   ├── VaultUnlock.tsx           # vault unlock prompt
│   ├── VaultLockButton.tsx       # toolbar lock/unlock toggle
│   ├── ConfirmDialog.tsx         # in-app confirm modal; used instead of window.confirm
│   ├── TitleBar.tsx              # slim drag/close bar for the pre-vault screens (desktop only)
│   ├── WindowControls.tsx        # min/max/close for the frameless desktop window; renders
│   │                             #   nothing in the browser build or on macOS
│   ├── CodeBlock.tsx             # syntax-highlighted code display (shiki)
│   ├── MarkdownPreview.tsx       # renders markdown content (marked)
│   ├── HighlightedText.tsx       # renders injection-scan match highlights
│   ├── Logo.tsx                  # SVG logo used in navbar and favicon
│   └── useProtocolTraces.ts      # React hook subscribing to protocol trace events
│
└── lib/                          # pure business-logic modules — testable in isolation
    ├── mcpClient.ts              # public MCP API + all protocol tracing; delegates transport
    │                             #   to the active Host (see host/ below)
    ├── protocolTrace.ts          # in-memory MCP call event store; redacts auth material;
    │                             #   max 200 events; push/subscribe pattern
    ├── protocolDiff.ts           # diff two protocol call payloads (for call history view)
    ├── storage.ts                # StoredServer shape + read/clear of the pre-vault
    │                             #   plaintext server list (migration path only)
    ├── appData.ts                # bookmarks, call history, observation journals; goes through
    │                             #   the host's files group, falls back to localStorage
    ├── history.ts                # CallRecord types + ring-buffer management
    ├── bookmarks.ts              # bookmark CRUD helpers
    ├── serverTools.ts            # native + discovered tools, deduped; connected-server filter
    ├── replaySuites.ts           # capture and replay sets of MCP tool calls
    ├── scenarioRunner.ts         # execute ordered multi-step call chains (scenarios)
    ├── schemaLab.ts              # schema analysis: required fields, example generation,
    │                             #   JSON-RPC tools/call payload copy
    ├── permissionSurfaceAudit.ts # static risk audit of tool schemas (filesystem, network,
    │                             #   shell, data access)
    ├── promptInjectionScan.ts    # flag suspicious patterns in tool names/descriptions/params
    ├── observationJournal.ts     # trust journal domain model: notes, annotations, decisions
    ├── observationJournalStore.ts # journal persistence on top of appData
    ├── clientConfigExport.ts     # generate claude_desktop_config.json and Cursor JSON
    ├── handoffReadme.ts          # generate a "handoff" README describing a server's tools
    ├── agentReadiness.ts         # score a server 0–100 for agent-readiness heuristics
    ├── connectionErrorMessage.ts # user-facing error message formatter for connect failures
    ├── stdioParse.ts             # parse/serialize stdio command, args, env; bridge URL prefix
    ├── stdioSession.ts           # start a stdio session against the local bridge
    ├── windowControls.ts         # frameless-window min/max/close; deliberately OUTSIDE Host —
    │                             #   window chrome has no browser equivalent
    ├── highlighter.ts            # syntax highlighting (shiki) helper
    ├── promptSerialize.ts        # serialize MCP prompt messages for display
    ├── uriTemplate.ts            # RFC 6570 URI template expansion
    ├── export.ts                 # JSON round-trip import/export helpers
    │
    ├── host/                     # the browser/desktop seam — see "Host Seam" below
    │   ├── index.ts              # getHost(): detects the preload bridge, picks an impl
    │   ├── types.ts              # Host = { mcp, secrets, files, updates } interfaces
    │   ├── browser/              # MCP SDK in the renderer; /__vault_storage + /__app_data;
    │   │                         #   blob download for saveFile
    │   └── electron/             # every call forwarded over the preload bridge to main
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
        ├── vaultPersistence.ts   # envelope parse/serialize over the host's secrets group
        ├── types.ts              # vault domain types
        └── constants.ts          # PBKDF2 params; IDB names; LEGACY_SERVERS_STORAGE_KEY
```

The desktop app's main process lives in `electron/`. It is plain ESM Node — no TypeScript, no
build step — and is packaged verbatim by `electron-builder`.

```
electron/
├── main.js                       # entry: app lifecycle, single instance, registers the app://
│                                 #   scheme, builds the stores and registers every IPC handler
├── window.js                     # the frameless BrowserWindow; swallows reload chords, which
│                                 #   would otherwise drop every live MCP session
├── preload.cjs                   # the contextBridge surface. CommonJS ON PURPOSE — a sandboxed
│                                 #   preload cannot be ESM, so the channel names are duplicated
│                                 #   here rather than imported from ipc/channels.js
├── protocol.js                   # the app:// scheme serving dist/. Used instead of file:// so
│                                 #   the renderer gets a stable origin for localStorage/IndexedDB
├── windowState.js                # window bounds + maximised flag; pure restore logic so an
│                                 #   unplugged monitor or corrupt file is unit-testable
├── menu.js                       # application menu without Reload (see window.js); the menu must
│                                 #   still exist or the Edit roles/copy-paste stop working
├── externalLinks.js              # only http(s) may reach the OS — link targets can come from an
│                                 #   untrusted MCP server's descriptions or resources
├── ipc/                          # channels.js (contract, Electron-free), mcpHandlers.js,
│                                 #   nativeHandlers.js, windowHandlers.js, updateHandlers.js.
│                                 #   Handlers return envelopes, never throw: errors do not
│                                 #   survive IPC intact
├── mcp/sessions.js               # the live MCP client sessions; SDK wiring is injected so this
│                                 #   is testable without sockets or subprocesses
├── update/                       # update notifier: version.js (semver compare), feed.js (the
│                                 #   GitHub /releases/latest fetch), store.js (update-state.json),
│                                 #   service.js (the schedule and every skip/dismiss rule),
│                                 #   appVersion.js (see below). Notify-only: the builds are
│                                 #   unsigned, so nothing here downloads or installs
├── secrets/store.js              # vault envelope at the CLI's vault.json + the auto-unlock
│                                 #   passphrase sealed with safeStorage
└── appdata/store.js              # bookmarks/history/journals, gzipped, at the CLI's data.gz
```

### Host Seam

`src/lib/mcpClient.ts` keeps its public API and owns **all** protocol tracing; it delegates
transport to a `Host`. The browser host runs the MCP SDK in the renderer; the Electron host
forwards every operation over the preload bridge so the SDK runs in the main process instead.
`getHost()` picks between them by detecting the preload bridge (`window.mcpSleuth`) at first use.

Consequences for new code: put transport-level behavior behind `McpHost` so both builds get it,
never put tracing inside a host implementation, and remember that a host method must be
implementable on both sides. `windowControls.ts` is the deliberate exception — window chrome has
no browser equivalent, so it sits outside `Host` and no-ops in the browser.

The `updates` group shows the pattern for a desktop-only capability that still respects the rule:
the Electron host talks to `electron/update/`, and the browser host implements the same interface
by resolving `null` from every read. The banner and the version pill therefore disappear from the
browser build without a single `isDesktop` branch in a component.

**`app.getVersion()` is not the app's version.** Electron reads it from the app's `package.json`
only when that file has a `main` field, and this one deliberately has none — `extraMetadata`
injects `main` into the packaged copy only. Unpackaged, `app.getVersion()` returns *Electron's*
version (43.4.1), which would announce a downgrade as an update in dev and in the e2e suite. Use
`resolveCurrentVersion()` from `electron/update/appVersion.js`.

---

## Server-Side Boundaries

Everything outside `src/` and `electron/` runs in Node and is intentionally minimal. Do not add
new functionality here unless it fits one of these existing boundaries. These modules have **zero
runtime dependencies** except `stdio-bridge.js`, which needs the MCP SDK.

| File | Purpose |
|------|---------|
| `server.js` | Zero-dep static file server for `dist/`. Proper MIME types, immutable cache headers for hashed assets, SPA fallback. Intercepts `/__mcp_proxy`, `/__mcp_stdio`, `/__app_data`, `/__vault_storage`. |
| `proxy.js` | Rewrites browser MCP requests to real MCP server URLs; adds CORS headers. Called by `server.js` and by the Vite dev middleware. |
| `stdio-bridge.js` | Spawns a stdio MCP subprocess and fronts it as a same-origin streamable-HTTP endpoint under `/__mcp_stdio/<id>`, so the browser build reuses one MCP client for both transports. The desktop app does not use it — Electron spawns stdio servers directly. |
| `data-dir.js` | Resolves the data directory (`MCP_SLEUTH_DATA_DIR`, then the pre-rename `MCP_EXPLORER_DATA_DIR`, then `~/.mcp-sleuth`) and performs the one-time non-destructive migration from the pre-rename directory. Every other store asks this module for its path. |
| `app-data-handler.js` | Reads/writes gzipped bookmarks + history + journals at `<data dir>/data.gz`, outside the browser sandbox. |
| `vault-file-handler.js` | Reads/writes the encrypted vault blob at `<data dir>/vault.json`. |
| `bin/mcp-sleuth.js` | CLI entry: builds if needed → starts `server.js` as a daemon → opens browser → handles `mcp-sleuth stop`. |
| `daemon-lock.js` | PID lock-file management (`<data dir>/daemon.json`) for the CLI daemon process. |

These are also the files `electron-builder.yml` must list explicitly: `electron/main.js` and
`electron/windowState.js` import several of them by relative path, and the `files` list is an
allowlist. Adding such an import without updating that list produces an app that packages cleanly
and dies on launch — `node scripts/check-packaged-imports.mjs` exists to catch exactly that.

---

## Persistence Model

Everything on disk lives in one directory, `~/.mcp-sleuth/`, shared by the CLI and the desktop
app. Override it with `MCP_SLEUTH_DATA_DIR`; `MCP_EXPLORER_DATA_DIR` is still honoured for
pre-rename scripts. Because both builds use the same files and nothing locks them, running the
CLI and the desktop app at once is last-write-wins.

| Store | Mechanism | What lives there |
|-------|-----------|-----------------|
| Server list + credentials | Encrypted vault (AES-GCM, PBKDF2) → `<data dir>/vault.json`; IndexedDB `mcp-sleuth` when no file API is reachable | Server URLs, names, transport config, API keys, bearer tokens, Basic auth |
| Bookmarks | `appData` → `<data dir>/data.gz`, or `localStorage` fallback | Bookmarked tool call IDs |
| Call history | `appData` → `<data dir>/data.gz`, or `localStorage` fallback | Ring buffer of recent tool calls |
| Observation journals | `appData` → `<data dir>/data.gz`, or `localStorage` fallback | Trust notes, tool annotations, approve/reject decisions |
| Vault auto-unlock passphrase | Sealed with the OS keychain via Electron `safeStorage` → `<data dir>/device-key.bin` (desktop only) | Generated passphrase; not written at all when the only backend is the insecure `basic_text` |
| Window state | `<data dir>/window-state.json` (desktop only) | Size, position, maximised flag |
| Update preferences | `<data dir>/update-state.json` (desktop only) | Auto-check flag, skipped and dismissed versions, last check time |
| CLI daemon lock | `<data dir>/daemon.json` (CLI only) | Daemon PID + port |
| Protocol traces | In-memory only (never persisted) | MCP call timeline for the current session |
| Replay suites | In-memory + optional JSON export | Captured call sets for replay |

### Pre-rename fallbacks — read-only, do not "fix"

Data written before the rename is still read once so nobody loses a vault or their history.
Writes always use the current names.

| Fallback | Where | Note |
|----------|-------|------|
| `~/.mcp-explorer/` | `data-dir.js` | Copied into `~/.mcp-sleuth/` on first run. Copied, not moved, so a downgrade still works. |
| `MCP_EXPLORER_DATA_DIR` | `data-dir.js` | Still honoured as an override. |
| IndexedDB `mcp-explorer` | `vault/constants.ts` (`LEGACY_IDB_NAME`) | Read once so an existing browser vault is not orphaned. |
| `mcp-explorer:bookmarks` / `:call-history` / `:app-data` | `appData.ts` (`PRE_RENAME_KEYS`) | Read-only; writes use the `mcp-sleuth:` keys. |
| `mcp-explorer.servers.v1` | `vault/constants.ts` (`LEGACY_SERVERS_STORAGE_KEY`) | The pre-vault plaintext server list. **Deliberately NOT renamed** — it names data written by older versions, so renaming it would match nothing and silently drop the migration. |

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
| Permission Surface | `PermissionSurfacePanel` | `permissionSurfaceAudit.ts` | Static audit of tool schemas inferring filesystem, network, shell, and data-access risk. A summary per server, deliberately not a pass/fail score. |
| Prompt Injection | `PromptInjectionPanel` | `promptInjectionScan.ts` | Flags suspicious patterns in tool names, descriptions, and parameter metadata, with the matches highlighted. |
| Observation Journal | `ObservationJournalPanel` | `observationJournal.ts`, `observationJournalStore.ts` | Per-server trust notes, tool annotations, invocation observations, approve/reject decisions. Persisted with app data; exportable as Markdown. |
| Agent Readiness | `AgentReadinessPanel` | `agentReadiness.ts` | Scores a connected server 0–100 across heuristics (tool descriptions, schema quality, error surfaces, etc.). Badge shown in server header. |

`DevToolsModal.tsx` owns the tab list — add a tab there, not in `App.tsx`. The **Scenario Runner**
(`ScenarioRunnerPanel` + `scenarioRunner.ts`, ordered multi-step call chains with parameter
threading between steps) is the exception: it is a separate overlay opened from `App.tsx`.

---

## Implementation Standards

### Component split

- `App.tsx` owns top-level state. Do not grow it — route new behavior through `src/lib/` modules.
- `src/components/*` renders UI. Components should not own significant business logic.
- `src/lib/*` owns reusable, testable behavior. Every non-trivial module gets a `*.test.ts` file.

### Test-Driven Development

Use TDD for all new behavior in `src/lib/` and `electron/`. Vitest covers
`src/**/*.test.ts`, `*.test.js` at the repo root, `electron/**/*.test.js`, and
`scripts/**/*.test.js` (506 tests). Electron
modules inject their dependencies (`fs`, the SDK, the dialog) precisely so they are testable
without launching Electron — keep it that way when adding to that tree.

The loop:

1. Write a focused failing test in the matching `*.test.ts` / `*.test.js` file.
2. Run `npm test -- <file>` to confirm the failure.
3. Implement the smallest change that makes it pass.
4. Refactor, then run the full suite (`npm test`).

### Dependency policy

Do not introduce new npm dependencies when existing Web APIs, React, TypeScript, or project
helpers are enough. The server-side files have zero runtime dependencies apart from the MCP SDK in
`stdio-bridge.js` — keep it that way. `electron` and `electron-builder` are **devDependencies**;
anything the packaged main process needs at runtime must be a real dependency and must reach the
asar. `package.json` must never gain a `main` field (see the Tech stack note above).

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
npm run lint                            # eslint (covers src/, electron/, and the root Node modules)
npm test                                # full vitest suite
```

If the change touches `electron/`, the host seam, or anything the main process imports, also:

```bash
npm run package:dir                          # unpacked build into release/
node scripts/check-packaged-imports.mjs      # every root module main imports is in the asar
xvfb-run -a npm run test:e2e:electron        # drop xvfb-run if you have a display
```

---

## Playwright Suites

Two suites, two configs.

### Browser release suite — `tests/release/`

25 spec files, 105 tests. Runs against the **built `dist/`** served by `server.js` at
`http://127.0.0.1:4173`. Playwright starts both that server and the MCP fixture
(`tests/fixtures/http-mcp-server.mjs`) on `127.0.0.1:3001` itself — no manual setup.

```bash
npx playwright test tests/release/
```

Spec numbering maps directly to release checklist sections (`§3.N`):

| Spec file | Area |
|-----------|------|
| `01-initial-load.spec.ts` | Initial load, empty state |
| `02-add-server.spec.ts` | Add server dialog |
| `03-connection-error.spec.ts` | Connection error messages |
| `04-tab-bar.spec.ts` | Tab bar navigation |
| `05-live-fixture-server.spec.ts` | Live fixture server connection |
| `06-tool-forms.spec.ts` | Tool input forms (all field types) |
| `07-result-pane.spec.ts` | Result pane rendering |
| `08-call-history-diff.spec.ts` | Call history diff view |
| `09-bookmarks.spec.ts` | Bookmarks persistence |
| `10-search.spec.ts` | Cross-server global search |
| `11-export.spec.ts` | Export dialog (JSON) |
| `12-meta-tool-discovery.spec.ts` | Meta-tool discovery |
| `13-resources.spec.ts` | Resources tab |
| `14-prompts.spec.ts` | Prompts tab |
| `15-protocol-inspector.spec.ts` | Protocol Inspector |
| `16-replay-suites.spec.ts` | Replay Suites |
| `17-schema-lab.spec.ts` | Schema Lab |
| `18-agent-readiness.spec.ts` | Agent Readiness scoring |
| `19-client-config-export.spec.ts` | Client Config Export |
| `20-handoff-readme.spec.ts` | Handoff README generation |
| `21-scenario-runner.spec.ts` | Scenario Runner |
| `22-stdio-transport.spec.ts` | Stdio transport (local bridge + echo tool) |
| `23-trust-evaluators.spec.ts` | Permission Surface, Prompt Injection scan, Observation Journal |
| `24-error-handling.spec.ts` | Unhandled rejections and uncaught errors are reported, app stays usable |
| `25-update-notifier.spec.ts` | The desktop update notice is absent from the browser build |

The numbers are a naming convention, not a mechanism — nothing enforces them — but they map to
the `§3.N` sections of the release checklist, so the next spec added should be `26`. If you
renumber one, update the `§` title inside it and the section list in `SKILL.md` in the same
change.

### Electron suite — `tests/electron/`

7 spec files, 43 tests, driven by `playwright.electron.config.ts` against the packaged main
process. Needs a display: on a headless machine use `xvfb-run -a`.

```bash
npm run test:e2e:electron                 # or: xvfb-run -a npm run test:e2e:electron
```

| Spec file | Area |
|-----------|------|
| `01-launch.spec.ts` | Launch and security posture (no node integration, no console errors) |
| `02-http-direct.spec.ts` | Direct HTTP transport from the main process (no proxy) |
| `03-stdio-direct.spec.ts` | Stdio spawned as a child process (no HTTP bridge) |
| `04-native-persistence.spec.ts` | Vault + app-data files written to the data directory |
| `05-app-chrome.spec.ts` | Frameless window, title bar, window controls, menu |
| `06-dialogs.spec.ts` | In-app dialogs — vault reset uses `ConfirmDialog`, not browser chrome |
| `07-updates.spec.ts` | Update notifications — banner, badge, skip/dismiss, opt-out, failure |

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

If the behavior differs between the browser build and the desktop app — or exists only in one of
them — cover it in `tests/electron/` too. Transport, persistence paths, window chrome, and native
dialogs all fall in that category.

### 2. Update the release skill

Update `SKILL.md` to reference the new or changed test section number, describe what a
manual pass looks like (what to observe, what failures block release), and update the
total test count if it changed.

### 3. Keep docs aligned

If `README.md` or `README.npm.md` describes the changed behavior (commands, features,
workflows), update them in the same branch. `README.npm.md` is what npm shows, so it covers the
CLI; `README.md` is what GitHub shows and covers all three ways to run the app, including the
desktop installers and the unsigned-install steps.
