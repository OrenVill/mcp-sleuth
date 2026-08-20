# Sleuth

Browser-based explorer for MCP servers over **streamable HTTP** or **stdio** — list and invoke tools with auto-generated forms.

## Install

```bash
npm install -g @orenvill/mcp-sleuth
```

The `-g` flag installs globally, making the `mcp-sleuth` command available anywhere in your terminal.

**Requirements:** Node.js 20 or later (`node --version`).

> **Upgrading from an older install?** If you previously used `npm install -g mcp-sleuth` or `npm install -g github:OrenVill/mcp-sleuth`, uninstall first:
> ```bash
> npm uninstall -g mcp-sleuth
> npm install -g @orenvill/mcp-sleuth
> ```

## Run

```bash
mcp-sleuth              # start + open browser at http://127.0.0.1:4173/
mcp-sleuth 3000         # custom port
mcp-sleuth --no-open    # skip opening the browser (also: OPEN=0)
```

## Update

```bash
npm update -g @orenvill/mcp-sleuth
```

## What it does

Point it at any MCP server:

- **HTTP** — streamable HTTP endpoint (typically `http://host:port/mcp`)
- **Stdio** — local subprocess (`command`, `args`, optional `cwd` and env), same as Cursor/Claude Desktop MCP config

The explorer auto-connects, lists all available tools, and generates input forms from each tool's JSON Schema so you can invoke them immediately from the browser.

**Stdio note:** stdio servers use a local Node bridge built into `mcp-sleuth`. You must run the app via **`mcp-sleuth`** (or `npm run dev` from source) — opening static files alone does not spawn subprocesses.

- Add / edit / remove HTTP or stdio MCP servers — persisted to `localStorage`
- Stdio bridge for local command-based MCP servers (requires `mcp-sleuth` or `npm run dev`)
- Local proxy mode for HTTP MCP servers that do not expose browser CORS headers
- Auto-discovered tool list via `tools/list`
- Generated forms for strings, numbers, booleans, enums, and JSON objects/arrays
- Protocol Inspector timeline for debugging MCP calls, results, errors, and durations
- Schema Lab for inspecting tool schemas, generating example args, and copying JSON-RPC calls
- Permission Surface audit, Prompt Injection scan, and Observation Journal for MCP trust evaluation
- Meta-tool discovery with one-click **Discover all tools**

## Desktop app

Sleuth also ships as an Electron desktop app — download an installer from the
[GitHub releases page](https://github.com/OrenVill/mcp-sleuth/releases/latest). Compared with
this CLI it adds:

- No CORS proxy — MCP requests go out from the Electron main process, so browser CORS never applies
- Stdio servers spawned directly as child processes, with no local HTTP bridge in between
- Vault auto-unlock from the OS keychain where the platform has a real keyring
- Native save dialogs for exports

The builds are unsigned, so macOS and Windows warn on first launch; the README on GitHub has the
click-through steps. There is no auto-update — updating means downloading a newer installer.

The CLI stays fully supported and is the only option for a remote or SSH session, where there is
no desktop to run an app on. Both share `~/.mcp-sleuth/` (override with `MCP_SLEUTH_DATA_DIR`), so
running the CLI and the desktop app simultaneously is last-write-wins — use one at a time.

## Full documentation

[github.com/OrenVill/mcp-sleuth](https://github.com/OrenVill/mcp-sleuth)

## License

MIT
