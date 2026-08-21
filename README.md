# Sleuth

A small Vite + React + TypeScript app that connects to **MCP servers over HTTP or stdio**, lists their tools, and lets you invoke them with auto-generated forms. Runs in the browser or as a desktop app.

Add any MCP HTTP endpoint or a local stdio command (Cursor/Claude-style `command` / `args` / `env`); Sleuth auto-connects on add and persists the list to the encrypted vault.

Three ways to run it:

- **From source** — `npm run dev` (see [Quick start](#quick-start)).
- **CLI** — `npx @orenvill/mcp-sleuth` serves the built app and opens your browser
  (see [Installation](#installation)). The only option for remote/SSH use.
- **Desktop app** — a packaged Electron build (see [Desktop app](#desktop-app)).

## Features

- **Add / edit / remove** any MCP server — HTTP or stdio — persisted to the encrypted vault under `~/.mcp-sleuth/`, no presets.
- **Auto-connect on add** — registers the server and immediately connects (streamable HTTP for HTTP servers; local stdio bridge for stdio servers).
- **Stdio transport** — spawn local MCP subprocesses (`command`, `args`, optional `cwd` and env vars); same tool UI as HTTP. In the browser build this goes through a Node-side bridge, so it requires **`npm run dev`** or the **`mcp-sleuth` CLI** (not plain static `dist/index.html`); the desktop app spawns them directly.
- **Embedded local proxy mode** — optionally routes HTTP MCP requests through Sleuth's localhost server so HTTP MCP servers do not need browser CORS support.
- **Auto-discovered tool list** — calls `tools/list` after connecting.
- **Generated input forms** from each tool's JSON Schema (strings, numbers, booleans, enums, JSON for objects/arrays).
- **Live tool invocation** with text + structured result display.
- **Protocol Inspector** — session-local MCP call timeline with method, params, result/error, status, and duration for debugging server behavior.
- **Schema Lab** — inspect tool input schemas, highlight required fields, generate example arguments, and copy JSON-RPC `tools/call` payloads.
- **Permission Surface** — static audit of tool schemas inferring filesystem, network, shell, and data-access risk (summary per server, not a pass/fail score).
- **Prompt Injection scan** — flags suspicious patterns in tool names, descriptions, and parameter metadata with highlighted matches.
- **Observation Journal** — per-server trust notes, tool annotations, invocation observations, and approve/reject decisions; persisted under `~/.mcp-sleuth/` and exportable as Markdown.
- **Meta-tool discovery** — recognizes tools that exist to discover *other* tools (`list_tools`, `search_tools`, `invoke_tool`, `get_manifest`, etc.) and surfaces a one-click **Discover all tools** button. Discovered tools appear in a collapsible section in the tool list and can be invoked directly or routed through a proxy meta-tool.

## Tech

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — browser client + `StreamableHTTPClientTransport`
- [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`
- [Electron](https://www.electronjs.org) + [electron-builder](https://www.electron.build) for the desktop build

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Then click **+ Add** in the sidebar:

- **HTTP:** point at a streamable-HTTP endpoint (typically `http://host:port/mcp`).
- **Stdio:** choose **Stdio**, enter `command` and `args` (one arg per line), optional working directory and env vars. The dev server (`npm run dev`) provides the local stdio bridge automatically.

## Desktop app

Sleuth also ships as an Electron desktop app. Download the installer for your platform from the
[latest GitHub release](https://github.com/OrenVill/mcp-sleuth/releases/latest):

| Platform | File |
|----------|------|
| macOS | `Sleuth-<version>-arm64.dmg` (Apple silicon) or `Sleuth-<version>-x64.dmg` (Intel) |
| Windows | `Sleuth-<version>-x64.exe` |
| Linux | `Sleuth-<version>-x86_64.AppImage` or `Sleuth-<version>-amd64.deb` |

What the desktop app adds over the browser build:

- **No CORS proxy.** MCP requests are made from the Electron main process, not from a browser
  origin, so CORS does not apply and the per-server proxy toggle has nothing to do.
- **Stdio without a bridge.** Stdio servers are spawned directly as child processes of the app;
  there is no `/__mcp_stdio` HTTP bridge in between.
- **Vault auto-unlock via the OS keychain**, where the platform has a real keyring. Sleuth
  declines the insecure `basic_text` backend (seen on some Linux desktops) and falls back to
  asking for the passphrase.
- **Native save dialogs** for exports instead of browser downloads.

### The builds are unsigned

This project has no Apple Developer certificate and no Windows code-signing certificate, so every
OS warns on first launch. That is expected, not a broken download:

- **macOS** — the first open is blocked. Open **System Settings → Privacy & Security**, find the
  message about Sleuth, and click **Open Anyway**. The right-click → Open trick is unreliable on
  current macOS; use Privacy & Security.
- **Windows** — SmartScreen shows "Windows protected your PC". Click **More info** →
  **Run anyway**.
- **Linux** — no warning; see the next section for how to launch it.

### Launching it on Linux

The deb installs to `/opt/Sleuth` and does not print anything when it finishes, so it is easy
to think nothing happened. It gives you two ways in:

```bash
sudo apt install ./Sleuth-<version>-amd64.deb
mcp-sleuth
```

The `mcp-sleuth` command comes from a symlink the package creates at `/usr/bin/mcp-sleuth`.
The app also appears in your application menu as **Sleuth**.

The AppImage needs no install — just make it executable:

```bash
chmod +x Sleuth-<version>-x86_64.AppImage
./Sleuth-<version>-x86_64.AppImage
```

**On WSL** there is no application menu, so the terminal command is the only way in. WSLg
supplies the window. Two quirks specific to WSL:

- If it exits complaining about the sandbox, add `--no-sandbox`.
- You get a passphrase prompt rather than automatic unlock: WSL has no keyring, so
  `safeStorage` reports the `basic_text` backend, and Sleuth refuses to seal a passphrase
  with a hardcoded key.

### Update notifications

The desktop app tells you when a newer version is out, and installing it stays a manual step.

Five seconds after launch, and every six hours after that, Sleuth asks GitHub for the latest
release of this repository. If it is newer than the version you are running, a banner appears
under the header:

- **Download** opens that release's page in your browser. It does not download anything itself —
  Linux ships both a `.deb` and an AppImage, and only you know which one you installed.
- **Later** collapses the banner to a violet `↑1.2.0` badge in the header, which stays as the
  reminder. That version never shows the banner again.
- **Skip** silences that version completely, banner and badge, until something newer ships.

The `v1.0.1` pill next to the app name is always there. Click it for the current version, a
**Check now** button, and the **Check for updates automatically** switch.

The check sends one unauthenticated request to `api.github.com` with a User-Agent and nothing
else — no identifiers, no app state, no telemetry. Turning the switch off stops it entirely; the
manual check still works. The preference lives in `<data dir>/update-state.json`.

The app still cannot update *itself*. `electron-updater` on macOS requires a signed and notarized
app, which this project does not have, so the last step is always: download the newer installer
and install it over the old one.

The browser and CLI builds have no update notice at all — they update with
`npm i -g @orenvill/mcp-sleuth@latest`.

### Running the desktop app from source

```bash
npm run electron:dev      # Electron pointed at the Vite dev server
npm run electron:start    # build, then run Electron against the built dist/
npm run package:dir       # unpacked build into release/ — the fast packaging check
npm run package           # installers for the current platform
npm run package:linux     # AppImage + deb
```

`npm run electron:dev` sets `MCP_SLEUTH_DEV_URL=http://localhost:5173`, so run `npm run dev` in
another terminal alongside it; renderer edits then hot-reload into the Electron window.

## Data directory

The desktop app and the CLI read and write the same directory, `~/.mcp-sleuth/`:

| File | Contents |
|------|----------|
| `vault.json` | Encrypted vault — server list and credentials |
| `data.gz` | Bookmarks, call history, observation journals |
| `device-key.bin` | Auto-unlock passphrase, sealed with the OS keychain (desktop only) |
| `window-state.json` | Desktop window size, position, maximised flag (desktop only) |
| `update-state.json` | Update-check preference and dismissed/skipped versions (desktop only) |
| `daemon.json` | CLI daemon lock file (CLI only) |

Override the directory with `MCP_SLEUTH_DATA_DIR=/path/to/dir`. `MCP_EXPLORER_DATA_DIR` is still
honoured for scripts written before the rename. A pre-rename `~/.mcp-explorer/` directory is
migrated once on first run — files are **copied**, not moved, so the old directory stays intact.

**Running the desktop app and the CLI at the same time is last-write-wins.** Nothing locks these
files. Run one at a time.

## Installation

```bash
npm install -g @orenvill/mcp-sleuth
```

The `-g` flag installs the package **globally**, making the `mcp-sleuth` command available anywhere in your terminal. Without `-g`, npm installs it as a local project dependency and the command won't be on your `PATH`.

> **Already have an older install?** If you previously installed via `npm install -g mcp-sleuth` or `npm install -g github:OrenVill/mcp-sleuth`, uninstall it first:
> ```bash
> npm uninstall -g mcp-sleuth
> npm install -g @orenvill/mcp-sleuth
> ```

**Requirements:** Node.js 20 or later. Check with `node --version`.

## Run

```bash
mcp-sleuth              # start + open browser at http://127.0.0.1:4173/
mcp-sleuth 3000         # custom port
mcp-sleuth --no-open    # skip opening the browser (also: OPEN=0)
```

The CLI prints a single colored ready line and opens your default browser:

```
  mcp-sleuth  ➜  http://127.0.0.1:4173/
```

To update to the latest version:

```bash
npm update -g @orenvill/mcp-sleuth
```

## Build / serve

```bash
npm run build        # tsc + vite build → dist/
npm start            # serve dist/ via the built-in static server (server.js)
npm run preview      # vite preview (dev-only sanity check)
```

`npm start` runs a dependency-free Node static server (`server.js`) that serves
`dist/` with proper MIME types, immutable cache headers for hashed assets, and
SPA fallback. Configure with `PORT=3000 npm start` or `node server.js 3000`.

## Connecting to a server

The app starts with no servers. Click **+ Add** in the sidebar and pick **HTTP** or **Stdio**.

### HTTP

Fill in a name and the streamable HTTP URL (typically `http://host:port/mcp`); the explorer registers and auto-connects over streamable HTTP.

### Stdio

Choose **Stdio** and configure:

| Field | Description |
|-------|-------------|
| Command | Executable to spawn (e.g. `npx`, `node`, `python`) |
| Arguments | One argument per line |
| Working directory | Optional |
| Environment | Optional key/value pairs (secrets stored in the encrypted vault) |

Stdio servers run as a local subprocess on your machine. The explorer's Node server (`server.js`, started by **`mcp-sleuth`** or **`npm run dev`**) exposes a same-origin Streamable HTTP bridge at `/__mcp_stdio/…` so the browser can reuse the same MCP client and dev tools as HTTP servers.

**Stdio requires the local explorer server.** Opening `dist/index.html` directly (without `server.js` or Vite) will not work — run `npm run dev` during development or `mcp-sleuth` / `npm start` for the built app.

Use the **✎** button next to a server to edit its name, transport settings, or description; **✕** removes it.

## Layout

```
bin/
└── mcp-sleuth.js              # CLI: vite build (silent) → server.js → opens browser
server.js                        # zero-dep static server for dist/ (used by `npm start`)
data-dir.js                      # ~/.mcp-sleuth resolution + one-time pre-rename migration
electron/                        # desktop app main process (see Desktop app above)
├── main.js                      # entry: app lifecycle, app:// scheme, IPC wiring
├── window.js                    # frameless BrowserWindow
├── preload.cjs                  # sandboxed context-bridge (CommonJS by necessity)
└── ipc/ mcp/ secrets/ appdata/  # IPC channels, MCP sessions, vault + app-data stores
src/
├── App.tsx                      # 3-column layout + state
├── main.tsx                     # entry
├── index.css                    # Tailwind import
├── types.ts                     # ServerEntry, ToolDef, ToolResult, JSON Schema
├── lib/
│   ├── mcpClient.ts             # traced MCP API; delegates transport to the active host
│   ├── host/                    # browser host (SDK in the renderer) | Electron host (IPC)
│   └── storage.ts               # pre-vault server-list migration
└── components/
    ├── Logo.tsx                 # logo mark (used in navbar + favicon)
    ├── ServerList.tsx           # left column — connect / disconnect / edit / remove
    ├── ToolList.tsx             # middle column — tools advertised by the server
    ├── ToolDetail.tsx           # right column — form + result
    ├── SchemaForm.tsx           # JSON Schema → form
    ├── ResultPane.tsx           # render MCP tool results
    └── ServerFormDialog.tsx     # add / edit server modal
```

## CORS notes

The browser sends MCP requests with headers such as `Mcp-Session-Id` and `Mcp-Protocol-Version`. By default, **Proxy through local server** is enabled for each server, which rewrites requests through the local `mcp-sleuth` static server and adds the browser-facing CORS headers there.

You can disable the checkbox for a server when its HTTP endpoint already supports browser clients directly. In direct mode, the MCP server must allow those MCP headers in `Access-Control-Allow-Headers` and expose `Mcp-Session-Id` via `Access-Control-Expose-Headers`.

None of this applies to the desktop app: requests originate in the Electron main process, not a browser origin, so there is no CORS to work around and no proxy in the path.

## Releases

Versioning is SemVer, automated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commit](https://www.conventionalcommits.org/) messages on `main`.

- Every push to `main` updates a long-lived **Release PR** that bumps `package.json`, updates `CHANGELOG.md`, and lists the included changes.
- Merging the Release PR creates a git tag (`vX.Y.Z`), a GitHub Release with the changelog section, and uploads a built `dist.tgz` artifact plus the unsigned desktop installers built on a macOS / Windows / Linux matrix.
- Commit types that bump the version: `feat:` (minor, pre-1.0), `fix:` / `perf:` / `refactor:` (patch). `feat!:` or a `BREAKING CHANGE:` footer triggers a major bump (post-1.0) or a minor bump (pre-1.0).

The package is published to the npm registry as `@orenvill/mcp-sleuth`. To install from source instead:

```bash
npm install -g github:OrenVill/mcp-sleuth
```

Or download `dist.tgz` from a [GitHub Release](https://github.com/OrenVill/mcp-sleuth/releases) and serve it with any static host.

## License

MIT.
