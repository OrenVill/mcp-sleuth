# MCP Explorer as an Electron Desktop App — Design

**Date:** 2026-08-20
**Status:** Approved, pending implementation plan

## Goal

Ship MCP Explorer as an installable desktop application while keeping the existing
`npx @orenvill/mcp-explorer` CLI + browser experience working unchanged.

Electron is being adopted for three reasons, in priority order:

1. **Distribution** — a downloadable installer for users who do not have Node.
2. **Native capabilities** — direct MCP transport, OS-keychain credential storage,
   and native file dialogs, replacing localhost-bridge workarounds.
3. **Desktop UX** — a real application window rather than a browser tab.

Electron becomes the flagship distribution. The CLI remains fully supported, which
also preserves the remote/SSH use case that a desktop binary cannot serve.

## Non-Goals (v1)

- Tray icon, global shortcuts, `mcp-explorer://` deep links, native notifications.
  These are deferred; the capability layer below is where they will land.
- Code signing, notarization, and auto-update. See *Packaging* for consequences.
- Real multi-process file locking between the CLI daemon and the desktop app.
- Migrating browser mode to a Node-owned MCP layer (considered and rejected for v1;
  see *Alternatives*).

## Architecture: the host seam

A new `src/lib/host/` directory exposes one interface with three capability groups:

```ts
interface Host {
  readonly kind: 'browser' | 'electron';
  mcp: McpHost;         // connect, connectStdio, disconnect, callTool,
                        // listResources, readResource, listPrompts, getPrompt,
                        // refetchTools, isConnected, onToolsChanged
  secrets: SecretsHost; // load / save / delete the credential store
  files: FilesHost;     // saveFile, readAppData, writeAppData
}
```

`src/lib/host/index.ts` feature-detects `window.mcpExplorer` (injected by the Electron
preload) and exports a single resolved `host` singleton. Two implementations live in
`src/lib/host/browser/` and `src/lib/host/electron/`.

### The trace seam sits above the host seam

This is the load-bearing decision of the design.

`src/lib/mcpClient.ts` keeps its exact public API and keeps every `traceProtocolCall` /
`traceOptionalProtocolCall` wrapper. It stops constructing the MCP SDK client itself and
delegates transport work to `host.mcp`. Today's SDK-in-renderer implementation moves
verbatim into `src/lib/host/browser/mcpBrowser.ts`.

Consequences:

- `protocolTrace.ts`, `useProtocolTraces.ts`, and `ProtocolInspectorPanel.tsx` are
  **untouched**. No main-to-renderer trace streaming channel, no second redaction path.
- Redaction stays in the renderer, where the existing security rule already lives.
- Traced durations in Electron include one IPC round trip (sub-millisecond). Accepted
  in preference to building a parallel trace channel.
- `App.tsx`, `ToolDetail.tsx`, `ResourceDetail.tsx`, and `PromptDetail.tsx` — the only
  four consumers of `mcpClient` — do not change.
- `mcpClient.test.ts` is rewritten against a fake host instead of a mocked SDK.

### MCP transport in Electron

The Electron **main** process owns the `@modelcontextprotocol/sdk` client:

- HTTP requests originate from Node, so CORS is irrelevant and `/__mcp_proxy` is never
  used.
- Stdio servers are spawned as direct `child_process` children via
  `StdioClientTransport`; `/__mcp_stdio` and the facade server in `stdio-bridge.js`
  are bypassed entirely.

`proxy.js`, `stdio-bridge.js`, and `server.js` stay on disk, unchanged, serving browser
mode.

## Process model

New top-level `electron/` directory: `main.js`, `preload.js`, `ipc/`. Written as plain
ESM JavaScript with `.d.ts` siblings, matching the house style of `server.js` and
`proxy.js` rather than introducing a second TypeScript build pipeline.

### Security posture

MCP Explorer connects to untrusted MCP servers and renders their tool descriptions,
markdown, and image results. The project already ships a prompt-injection scanner that
acknowledges this threat model. A Node-enabled renderer would be a material escalation
of that existing risk, so:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The preload exposes exactly one frozen `window.mcpExplorer` object via
  `contextBridge`. No `ipcRenderer` passthrough.
- One IPC channel per host method. `serverId` is validated in main, following the
  existing `isValidServerId` pattern in `stdio-bridge.js`.
- External navigation and `window.open` are denied and handed to the system browser.

## Native capabilities

### Secrets — OS keychain without replacing the vault

The vault today encrypts the **entire server list** (`StoredServer[]`), not just
credentials, and `App.tsx` gates the whole application behind `vaultPhase`.

Rather than replacing it, Electron:

1. Generates a random high-entropy passphrase on first run.
2. Seals it with `safeStorage.encryptString`.
3. Uses it to unlock the **existing PBKDF2 envelope** at startup.

`crypto.ts`, `envelope.ts`, and `service.ts` do not change. Only `getBootstrapPhase` and
`App.tsx`'s bootstrap effect learn an auto-unlock path. The desktop app never prompts
for a passphrase. One vault format is retained across both hosts, so the vault file
stays portable between CLI and desktop.

**Fallback:** `safeStorage.isEncryptionAvailable()` returns false on Linux without a
keyring. In that case the app falls back to today's passphrase prompt rather than
silently storing key material in plaintext.

### Files

`host.files.saveFile(name, contents, mime)` maps to `dialog.showSaveDialog` in Electron
and to today's blob-and-anchor download in the browser. There are two call sites to
convert: `src/lib/export.ts:192` and `src/components/ObservationJournalPanel.tsx:129`.

App data is written directly via `fs` in main, against the **same `~/.mcp-explorer/`
directory** already used by `app-data-handler.js` and `vault-file-handler.js` (both
honour `MCP_EXPLORER_DATA_DIR`). A user who used the CLI and then installs the desktop
app keeps their bookmarks, history, and observation journal.

**Known limitation:** CLI and desktop running simultaneously means last-write-wins on
`data.gz`. v1 mitigates with `requestSingleInstanceLock()` plus a warning when
`daemon-lock.js` reports a live CLI daemon. Real file locking is out of scope.

## Packaging and CI

`electron-builder`, configured in `electron-builder.yml`. Targets: macOS `dmg` + `zip`
(universal), Windows `nsis`, Linux `AppImage` + `deb`.

`electron` and `electron-builder` are **devDependencies**, so `npx @orenvill/mcp-explorer`
is unaffected. `package.json`'s `files` field is an allowlist, so no Electron artifacts
can leak into the npm tarball.

CI changes:

- `release.yml` gains a `desktop` job with `needs: release-please`, gated on
  `release_created`, running a `[ubuntu, macos, windows]` matrix and uploading
  installers to the existing `tag_name`. Versioning stays entirely with release-please.
- `build.yml` gains a `--dir`-only Electron build on PRs, so packaging breakage is
  caught before a tag without paying for full installer generation per PR.

### Consequences of shipping unsigned

These must be documented in `README.md`, not discovered by users:

- macOS shows "unidentified developer". On current macOS the right-click-to-Open trick
  is unreliable; the documented path is System Settings → Privacy & Security →
  **Open Anyway**.
- Windows SmartScreen requires More info → Run anyway.
- **No auto-update.** `electron-updater` on macOS requires a signed application.
  Desktop updates are manual downloads until code-signing certificates are purchased.

## Testing

### 1. Browser regression (acceptance criterion)

All 23 existing `tests/release/` specs must pass **unmodified**. If any spec requires
editing, the host seam has leaked into the browser path and the refactor is wrong.

### 2. Unit (vitest)

- Host selection by feature detection.
- `mcpBrowser` — today's `mcpClient.test.ts`, moved essentially verbatim.
- Rewritten `mcpClient.test.ts` driven by a fake host, asserting every method still
  emits a protocol trace event.
- IPC channel and `serverId` validation.
- Auto-unlock logic with an injected fake `safeStorage`, covering the
  Linux-no-keyring fallback path.

### 3. Electron E2E

A new `tests/electron/` suite under a second Playwright config using
`_electron.launch()`. It cannot live in `tests/release/`, whose `webServer` block is
bound to `127.0.0.1:4173` and whose `setupVault()` helper assumes a passphrase prompt
the desktop app deliberately no longer shows.

Specs:

- Launch, window opens, auto-unlocked with no passphrase prompt.
- Connect to the `localhost:3001` fixture **with proxy disabled**, proving direct
  transport.
- Spawn a stdio server with zero `/__mcp_stdio` traffic.
- Export through the save dialog.
- App data lands in `MCP_EXPLORER_DATA_DIR`.

**Gotcha designed for up front:** Playwright cannot drive native dialogs. Main
short-circuits `showSaveDialog` to a fixed path under an
`MCP_EXPLORER_E2E=1` flag.

### Release gate compliance

Per `CLAUDE.md`, the same branch must also update
`.cursor/skills/prepare-for-release/SKILL.md` with a new Electron section and a revised
test count, and update `README.md` / `README.npm.md` to describe the desktop download
alongside the CLI.

Two pre-existing documentation drifts are in scope to fix while here, since this work
touches the same files:

- `CLAUDE.md`'s spec table stops at `21`, but `tests/release/` contains 23 spec files.
  `22-stdio-transport.spec.ts` and `22-trust-evaluators.spec.ts` are both numbered `22`;
  one is renumbered to `23`, and the new Electron suite is documented separately since
  it lives outside `tests/release/`.
- The `CLAUDE.md` server-side boundary table omits `stdio-bridge.js`, which the Electron
  path explicitly bypasses and must therefore be described.

## Implementation phasing

The work decomposes into three phases with a shippable, verifiable state at each
boundary:

1. **Host seam, browser only.** Introduce `src/lib/host/`, move today's SDK-in-renderer
   code into `host/browser/`, rewire `mcpClient.ts` to delegate. No Electron code, no
   behaviour change. Done when all 23 release specs pass unmodified.
2. **Electron app and native capabilities.** `electron/` main + preload, the
   `electron` host implementation, keychain auto-unlock, native save dialog, shared
   `~/.mcp-explorer/` data directory, plus the `tests/electron/` suite.
3. **Packaging, CI, and docs.** `electron-builder`, the `release.yml` desktop job, the
   `build.yml` PR check, and the release-gate documentation updates.

## Alternatives considered

**B — Electron wraps the existing server.** Main spawns `server.js` on `127.0.0.1` and
`BrowserWindow` loads it. Roughly a day's work and yields distribution plus window
chrome, but MCP calls still hop through the proxy and stdio bridge, so it delivers none
of the chosen native capabilities. Rejected as a branded browser tab with an installer.

**C — Node owns MCP in both hosts.** Move the whole MCP layer into runtime-agnostic Node
code, reached over IPC from Electron and over HTTP/SSE from the browser. One
implementation, two channels, and browser mode would improve (no CORS ever, identical
stdio). Rejected for v1 because it refactors the working, tested browser path up front:
`protocolTrace`, `useProtocolTraces`, and several release specs all assume the SDK runs
in the renderer.

C remains the preferred long-term endpoint. If the two MCP bindings begin to drift,
migrating to C is the intended response.
