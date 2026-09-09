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
- **Self-signed certificates, per server** — tick a box to reach an `https` endpoint whose certificate no public CA signed, without disabling verification anywhere else.
- **Auto-discovered tool list** — calls `tools/list` after connecting.
- **Generated input forms** from each tool's JSON Schema (strings, numbers, booleans, enums, JSON for objects/arrays).
- **Live tool invocation** with text + structured result display.
- **Protocol Inspector** — session-local MCP call timeline with method, params, result/error, status, and duration for debugging server behavior.
- **Schema Lab** — inspect tool input schemas, highlight required fields, generate example arguments, and copy JSON-RPC `tools/call` payloads.
- **Permission Surface** — static audit of tool schemas inferring filesystem, network, shell, and data-access risk (summary per server, not a pass/fail score).
- **Prompt Injection scan** — flags suspicious patterns in tool names, descriptions, and parameter metadata with highlighted matches.
- **Observation Journal** — per-server trust notes, tool annotations, invocation observations, and approve/reject decisions; persisted under `~/.mcp-sleuth/` and exportable as Markdown.
- **Agent Chat** — drive a model you supply (local or cloud) against a connected server and watch how it actually uses the tools. Every tool call is approval-gated, the run's calls can be captured as a Replay Suite or recorded to the Observation Journal, and refusals feed Agent Readiness. See [Agent Chat](#agent-chat).
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

A release is only announced once its installers have actually been uploaded — the GitHub Release
is published several minutes before the build matrix finishes, and pointing you at an empty
release page would be worse than saying nothing.

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
| `vault.json` | Encrypted vault — server list, credentials, and Agent Chat model-server configs |
| `data.gz` | Bookmarks, call history, observation journals, agent-run counters |
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

### Editing a server never shows you its secrets

A stored password, token, API key, or environment value is not put back into the edit form. The
field shows `*****`, read-only, with **Change** to replace it and **Keep existing** to go back;
leaving it blank after **Change** removes the credential. Saving a field you did not touch keeps
what is already in the vault.

This is deliberate. `type="password"` only draws dots, and the value behind them is readable from
devtools, a browser extension, the primary selection on Linux, a password manager, and in some
browsers an ordinary copy. Keeping the plaintext out of the page is the only version of this that
actually holds. The same applies to the Agent Chat model-server API key.

## Agent Chat

Every other trust surface in Sleuth — Permission Surface, Prompt Injection, Agent Readiness —
infers risk from schemas and descriptions. Agent Chat closes the loop by letting a real model
loose on the server and showing you what it does.

It is a **test-bench for the server, not a chat client.** There is no cross-session memory, no
attachments, and no productivity workflow. The output is evidence about the server.

Open it with **Chat** in the toolbar.

### Bring your own model

Sleuth ships no model and no key. From the picker in the chat header, add an **LLM server**:

| Field | Notes |
|-------|-------|
| Name | Whatever you want to call it, e.g. `Local Ollama` |
| Type | OpenAI-compatible, Anthropic, or Google Gemini |
| Base URL | Defaults per type: `http://127.0.0.1:11434/v1` (Ollama), `https://api.anthropic.com/v1`, `https://generativelanguage.googleapis.com/v1beta` |
| API key | Leave empty for a local model |

Sleuth then asks that server which models it has and lists them; if it reports none, type a model
name by hand. "OpenAI-compatible" means anything serving `/v1/chat/completions` — Ollama, LM
Studio, llama.cpp, vLLM, OpenAI itself, Groq, OpenRouter, Together, DeepSeek. Anthropic and
Gemini have their own adapters because their tool-calling formats differ: Anthropic returns
`tool_use` blocks and takes results back as user messages, and Gemini keys a tool response by the
tool's name rather than by a call id. **The API key is stored in the same encrypted vault as your
MCP server credentials** — there is no plaintext credential store anywhere in Sleuth.

Tick the servers whose tools the model may see. The one you are investigating is ticked by
default; adding others is how you find out whether two servers export tools a model cannot tell
apart, so colliding names are reported rather than renamed away.

### Every call is approved by you

The model never calls a tool on its own. Each request pauses with the tool name and the exact
arguments, and you choose:

- **Allow** — run it once.
- **Always allow** — run it for the rest of this session without asking. Unavailable for any tool
  the Permission Surface audit tags `destructive`, `shell`, `credential`, or `admin`; those are
  risk-locked and ask every single time. The allowlist is per run and never persisted.
- **Deny**, with an optional reason — *Wrong tool*, *Bad arguments*, *Unsafe*, or *Just no*.

**A denial does not end the run.** The reason is handed back to the model as the tool's result and
the conversation continues, because how a model recovers from a refused call is itself a finding.
*Wrong tool* and *Bad arguments* each feed an Agent Readiness counter for that server; *Unsafe* and
*Just no* deliberately record nothing, so nobody is pushed into miscategorising a refusal to make
it count.

A run stops on its own after 8 model turns, and **Stop** cancels the in-flight model call and any
pending tool call.

The card takes focus when it appears, so it can be answered from the keyboard — but focus lands on
the card, not on **Allow**. A card can arrive while you are mid-sentence in the composer, and a
focused Allow would turn a stray Enter into an approved tool call. Tab once to reach it. Escape
never dismisses an open card either.

### While a run is going

- **You can always tell it is working.** Bouncing dots hold the place whenever the agent has the
  turn — waiting on the model, running a tool, thinking again after a result — and a caret trails
  the text as it streams. They are absent while an approval card is open, because that is your
  turn, not the agent's.
- **Type while it runs.** Enter queues the message and sends it the moment the run ends; a pill
  above the composer shows what is waiting, with an X to drop it. Enter sends, Shift+Enter starts
  a new line, and the composer grows with the text.
- **Jump to latest** appears if you scroll up to read something earlier — the transcript stops
  following you there rather than yanking the viewport, so this is the way back.
- **New chat** clears the conversation without leaving the overlay. **Retry** re-runs a failed
  turn from the existing history, so a dropped connection does not mean retyping the prompt.
- **Copy** any assistant message — as its markdown source, not the rendered text — or any tool
  result. Results too long for their box expand in place.
- **Escape** closes the overlay, unless a picker or an approval card is open.

### What you get out of it

- **Live trace** beside the transcript — every `tools/call` as it happens, with duration and a bar
  relative to the slowest call in the run. The same calls also land in the Protocol Inspector.
- **Capture** — save the run's successful tool calls as a Replay Suite and re-run them later.
- **Record** — send any tool step to that server's Observation Journal.
- **Agent Readiness** — deny reasons, tool errors, and runs that hit the turn limit become issues
  on the server's score, with recommendations aimed at the tool descriptions and schemas that
  caused them.

### Transcripts are never saved

Only compact per-server counters persist (runs, wrong-tool picks, bad-argument denials, tool
errors, unrecovered runs). The transcript itself — the messages, arguments, and raw tool output —
lives in memory for the session and is gone when you close the overlay. A transcript contains raw
output from the server you are investigating, which is exactly the material that should not sit on
disk.

### How provider traffic leaves

| Way you run it | Path |
|----------------|------|
| `npm run dev` / `mcp-sleuth` CLI | Through Sleuth's own local server at `/__llm_proxy`, then to the provider. This is why a local Ollama works without setting `OLLAMA_ORIGINS` — the browser only ever talks to same-origin. |
| Desktop app | Straight from the Electron main process, like MCP traffic. No proxy in the path. |

The proxy is a CORS forwarder, not a security boundary: the vault decrypts in the renderer, so the
key is in renderer memory either way. It accepts only the paths a provider actually exposes,
requires a same-origin request, and never logs request or response bodies.

LLM traffic does **not** appear in the Protocol Inspector — that timeline is MCP only. The tool
calls the model causes do.

## Layout

```
bin/
└── mcp-sleuth.js              # CLI: vite build (silent) → server.js → opens browser
server.js                        # zero-dep static server for dist/ (used by `npm start`)
data-dir.js                      # ~/.mcp-sleuth resolution + one-time pre-rename migration
llm-proxy.js                     # forwards Agent Chat provider calls (browser build only)
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
│   ├── agent/                   # Agent Chat: the model↔tool loop, gating, tool catalog,
│   │                            #   run summaries, provider adapters
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

## Self-signed certificates

A development or intranet MCP endpoint often serves TLS with a certificate no public CA signed.
For an `https` server the add/edit form offers **Allow self-signed certificate**, which turns off
certificate verification for that one server.

- **Desktop app** — applied in the main process, scoped to that server's hostname. Another server
  on a different host still has its certificate checked, even with the same certificate.
- **CLI and `npm run dev`** — applied by the local proxy, so the server also needs **Proxy through
  local server** on. A browser applies its own certificate checks to a direct connection and no
  page can waive them; the form says so when the combination cannot work.

The choice is stored in the vault with the rest of the server, is off unless you turn it on, and
never applies to any other server.

## Local endpoints

The CLI server and the dev server both expose a few same-origin endpoints: the MCP proxy, the
stdio bridge, the vault file, app data, and the Agent Chat provider forwarder. They exist for
Sleuth's own page and answer nothing else.

A request is served only when the browser reports it as same-origin and the `Host` header names
this server — a loopback literal, another IP literal, `localhost`, or the host it was bound to.
Both checks are needed: the origin check stops any other page in your browser from driving these
endpoints, and pinning `Host` is what stops DNS rebinding, which would otherwise make an
attacker's own domain look same-origin.

If you front Sleuth under a hostname of your own, list it:

```bash
MCP_SLEUTH_ALLOWED_HOSTS=sleuth.internal,sleuth.example.com mcp-sleuth
```

Requests from `curl` and other non-browser clients are refused too, since they carry no
provenance. That is deliberate: these endpoints are not an API.

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


## Code signing policy

Free code signing on Windows provided by [SignPath.io](https://about.signpath.io),
certificate by [SignPath Foundation](https://signpath.org).

**Team roles**
- Committers and reviewers: Oren Vill ([@OrenVill](https://github.com/OrenVill))
- Approvers: Oren Vill ([@OrenVill](https://github.com/OrenVill))

**Privacy policy**

Sleuth is local-first. All state lives in `~/.mcp-sleuth/` on your machine.
There is no account, no backend service, and no telemetry or analytics.

Sleuth makes outbound network requests only to:
- MCP servers you add yourself.
- The LLM provider you configure for Agent Chat, using your own API key.
  Prompts, tool schemas and tool results are sent to that provider and are
  governed by its own privacy policy. Agent Chat transcripts are never persisted.
- `api.github.com`, roughly every six hours, to check whether a newer release
  exists. This sends no data about you or your servers, and can be disabled in
  Settings.

## License

MIT.
