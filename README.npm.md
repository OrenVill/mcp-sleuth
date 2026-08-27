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

- Add / edit / remove HTTP or stdio MCP servers — persisted to the encrypted vault under `~/.mcp-sleuth/`
- Stdio bridge for local command-based MCP servers (requires `mcp-sleuth` or `npm run dev`)
- Local proxy mode for HTTP MCP servers that do not expose browser CORS headers
- Auto-discovered tool list via `tools/list`
- Generated forms for strings, numbers, booleans, enums, and JSON objects/arrays
- Protocol Inspector timeline for debugging MCP calls, results, errors, and durations
- Schema Lab for inspecting tool schemas, generating example args, and copying JSON-RPC calls
- Permission Surface audit, Prompt Injection scan, and Observation Journal for MCP trust evaluation
- Meta-tool discovery with one-click **Discover all tools**
- Agent Chat — drive your own model against a connected server, with every tool call approved by you (see below)

## Agent Chat

Click **Chat** in the toolbar to point a model you supply at a connected MCP server and watch how
it actually uses the tools. It is a test-bench for the server, not a chat client — the output is
evidence about the server, not a conversation worth keeping.

Add an **LLM server** from the picker in the chat header: a name, an OpenAI-compatible base URL
(defaults to `http://127.0.0.1:11434/v1` for Ollama), and an API key only if the provider needs
one. Sleuth asks that server which models it has and lists them. The key is stored in the same
encrypted vault as your MCP server credentials.

**Local models work without any extra configuration.** The browser never calls the provider
directly — `mcp-sleuth`'s own local server forwards the request at `/__llm_proxy`, so everything
the page sends is same-origin. That is why a local Ollama works on the first try with no
`OLLAMA_ORIGINS` set. The forwarder accepts only the endpoints a provider actually exposes,
requires a same-origin request, and never logs request or response bodies. It is a CORS
forwarder, not a security boundary: the vault decrypts in the page, so the key is in browser
memory either way.

What the chat does:

- **Every tool call is approved by you**, showing the tool name and the exact arguments. Allow it
  once, allow it for the rest of the session, or deny it with a reason. Tools the Permission
  Surface audit tags destructive, shell, credential, or admin can never be session-allowed — they
  ask every time.
- **A denial does not end the run.** The reason goes back to the model as the tool's result, so
  you see how it recovers. *Wrong tool* and *Bad arguments* feed the server's Agent Readiness
  score.
- **Live trace** beside the transcript, with every call also landing in the Protocol Inspector.
- **Capture** a run's tool calls as a Replay Suite, or **Record** any step to the Observation
  Journal.
- **Transcripts are never written to disk.** Only per-server counters persist in `~/.mcp-sleuth/`;
  the messages and raw tool output live in memory for the session.

A run stops on its own after 8 model turns, and **Stop** cancels whatever is in flight.

## Desktop app

Sleuth also ships as an Electron desktop app — download an installer from the
[GitHub releases page](https://github.com/OrenVill/mcp-sleuth/releases/latest). Compared with
this CLI it adds:

- No CORS proxy — MCP requests go out from the Electron main process, so browser CORS never applies
- Stdio servers spawned directly as child processes, with no local HTTP bridge in between
- Vault auto-unlock from the OS keychain where the platform has a real keyring
- Native save dialogs for exports
- Agent Chat provider requests sent straight from the main process, with no local forwarder in between

The builds are unsigned, so macOS and Windows warn on first launch; the README on GitHub has the
click-through steps. There is no auto-update — updating means downloading a newer installer.

The CLI stays fully supported and is the only option for a remote or SSH session, where there is
no desktop to run an app on. Both share `~/.mcp-sleuth/` (override with `MCP_SLEUTH_DATA_DIR`), so
running the CLI and the desktop app simultaneously is last-write-wins — use one at a time.

## Full documentation

[github.com/OrenVill/mcp-sleuth](https://github.com/OrenVill/mcp-sleuth)

## License

MIT
