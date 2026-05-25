# MCP Explorer

A small Vite + React + TypeScript app that connects to **MCP servers over HTTP** from the browser, lists their tools, and lets you invoke them with auto-generated forms.

Add any MCP HTTP endpoint, the explorer auto-connects on add and persists the list to `localStorage`.

## Features

- **Add / edit / remove** any MCP HTTP server — persisted to `localStorage`, no presets.
- **Auto-connect on add** — registers the server and immediately establishes the streamable HTTP transport.
- **Embedded local proxy mode** — optionally routes MCP requests through the explorer's localhost server so HTTP MCP servers do not need browser CORS support.
- **Auto-discovered tool list** — calls `tools/list` after connecting.
- **Generated input forms** from each tool's JSON Schema (strings, numbers, booleans, enums, JSON for objects/arrays).
- **Live tool invocation** with text + structured result display.
- **Meta-tool discovery** — recognizes tools that exist to discover *other* tools (`list_tools`, `search_tools`, `invoke_tool`, `get_manifest`, etc.) and surfaces a one-click **Discover all tools** button. Discovered tools appear in a collapsible section in the tool list and can be invoked directly or routed through a proxy meta-tool.

## Tech

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — browser client + `StreamableHTTPClientTransport`
- [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Then make sure an MCP server is running somewhere (it must expose a streamable-HTTP endpoint, typically at `/mcp`) and click **+ Add** in the sidebar.

## Installation

```bash
npm install -g @orenvill/mcp-explorer
```

The `-g` flag installs the package **globally**, making the `mcp-explorer` command available anywhere in your terminal. Without `-g`, npm installs it as a local project dependency and the command won't be on your `PATH`.

> **Already have an older install?** If you previously installed via `npm install -g mcp-explorer` or `npm install -g github:OrenVill/mcp-explorer`, uninstall it first:
> ```bash
> npm uninstall -g mcp-explorer
> npm install -g @orenvill/mcp-explorer
> ```

**Requirements:** Node.js 20 or later. Check with `node --version`.

## Run

```bash
mcp-explorer              # start + open browser at http://127.0.0.1:4173/
mcp-explorer 3000         # custom port
mcp-explorer --no-open    # skip opening the browser (also: OPEN=0)
```

The CLI prints a single colored ready line and opens your default browser:

```
  mcp-explorer  ➜  http://127.0.0.1:4173/
```

To update to the latest version:

```bash
npm update -g @orenvill/mcp-explorer
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

The app starts with no servers. Click **+ Add** in the sidebar, fill in a name and the streamable HTTP URL (typically `http://host:port/mcp`), and the explorer will register and auto-connect.

Use the **✎** button next to a server to edit its name, URL, or description; **✕** removes it.

## Layout

```
bin/
└── mcp-explorer.js              # CLI: vite build (silent) → server.js → opens browser
server.js                        # zero-dep static server for dist/ (used by `npm start`)
src/
├── App.tsx                      # 3-column layout + state
├── main.tsx                     # entry
├── index.css                    # Tailwind import
├── types.ts                     # ServerEntry, ToolDef, ToolResult, JSON Schema
├── lib/
│   ├── mcpClient.ts             # Client + StreamableHTTPClientTransport wrapper
│   └── storage.ts               # localStorage persistence for the server list
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

The browser sends MCP requests with headers such as `Mcp-Session-Id` and `Mcp-Protocol-Version`. By default, **Proxy through local explorer** is enabled for each server, which rewrites requests through the local `mcp-explorer` static server and adds the browser-facing CORS headers there.

You can disable the checkbox for a server when its HTTP endpoint already supports browser clients directly. In direct mode, the MCP server must allow those MCP headers in `Access-Control-Allow-Headers` and expose `Mcp-Session-Id` via `Access-Control-Expose-Headers`.

## Releases

Versioning is SemVer, automated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commit](https://www.conventionalcommits.org/) messages on `main`.

- Every push to `main` updates a long-lived **Release PR** that bumps `package.json`, updates `CHANGELOG.md`, and lists the included changes.
- Merging the Release PR creates a git tag (`vX.Y.Z`), a GitHub Release with the changelog section, and uploads a built `dist.tgz` artifact.
- Commit types that bump the version: `feat:` (minor, pre-1.0), `fix:` / `perf:` / `refactor:` (patch). `feat!:` or a `BREAKING CHANGE:` footer triggers a major bump (post-1.0) or a minor bump (pre-1.0).

The package is published to the npm registry as `@orenvill/mcp-explorer`. To install from source instead:

```bash
npm install -g github:OrenVill/mcp-explorer
```

Or download `dist.tgz` from a [GitHub Release](https://github.com/OrenVill/mcp-explorer/releases) and serve it with any static host.

## License

MIT.
