# MCP Explorer

Browser-based explorer for MCP servers over streamable HTTP — list and invoke tools with auto-generated forms.

## Install

```bash
npm install -g @orenvill/mcp-explorer
```

The `-g` flag installs globally, making the `mcp-explorer` command available anywhere in your terminal.

**Requirements:** Node.js 20 or later (`node --version`).

> **Upgrading from an older install?** If you previously used `npm install -g mcp-explorer` or `npm install -g github:OrenVill/mcp-explorer`, uninstall first:
> ```bash
> npm uninstall -g mcp-explorer
> npm install -g @orenvill/mcp-explorer
> ```

## Run

```bash
mcp-explorer              # start + open browser at http://127.0.0.1:4173/
mcp-explorer 3000         # custom port
mcp-explorer --no-open    # skip opening the browser (also: OPEN=0)
```

## Update

```bash
npm update -g @orenvill/mcp-explorer
```

## What it does

Point it at any MCP server that exposes a streamable HTTP endpoint (typically `http://host:port/mcp`). The explorer auto-connects, lists all available tools, and generates input forms from each tool's JSON Schema so you can invoke them immediately from the browser.

- Add / edit / remove MCP servers — persisted to `localStorage`
- Local proxy mode for MCP servers that do not expose browser CORS headers
- Auto-discovered tool list via `tools/list`
- Generated forms for strings, numbers, booleans, enums, and JSON objects/arrays
- Protocol Inspector timeline for debugging MCP calls, results, errors, and durations
- Meta-tool discovery with one-click **Discover all tools**

## Full documentation

[github.com/OrenVill/mcp-explorer](https://github.com/OrenVill/mcp-explorer)

## License

MIT
