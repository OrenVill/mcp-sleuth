# MCP Detective

Browser-based explorer for MCP servers over **streamable HTTP** or **stdio** — list and invoke tools with auto-generated forms.

## Install

```bash
npm install -g @orenvill/mcp-detective
```

The `-g` flag installs globally, making the `mcp-detective` command available anywhere in your terminal.

**Requirements:** Node.js 20 or later (`node --version`).

> **Upgrading from `@orenvill/mcp-sleuth`?** Uninstall the old global package, then install MCP Detective. Your data under `~/.mcp-sleuth/` is copied automatically into `~/.mcp-detective/` the first time you run `mcp-detective` (or the desktop app):
> ```bash
> npm uninstall -g mcp-sleuth @orenvill/mcp-sleuth
> npm install -g @orenvill/mcp-detective
> ```
> The `mcp-sleuth` command still works as an alias on the new package.

## Run

```bash
mcp-detective              # start + open browser at http://127.0.0.1:4173/
mcp-detective 3000         # custom port
mcp-detective --no-open    # skip opening the browser (also: OPEN=0)
```

### Terminal CLI

Subcommands use the same vault and servers as the app (`~/.mcp-detective/vault.json`).

**Git checkout:** your shell may still run an older global `mcp-detective` that only starts the browser UI. Use `node bin/mcp-detective.js …` from the repo (after `npm run build`), or `npm link` at the repo root so `which mcp-detective` points at this package.

```bash
mcp-detective readiness          # unlock → pick server → markdown report
mcp-detective readiness --server "My API" --json   # CI (set MCP_DETECTIVE_VAULT_PASSPHRASE)
mcp-detective audit permission
mcp-detective export handoff -o handoff.md
mcp-detective call my_tool --args '{"key":"value"}'
mcp-detective provider list
mcp-detective server list
mcp-detective server import ~/.cursor/mcp.json   # merge into vault; ${env:…} from your shell
mcp-detective chat               # Agent Chat in the terminal (alias: tui)
```

Interactive runs prompt for your vault passphrase. For scripts, set `MCP_DETECTIVE_VAULT_PASSPHRASE` or `--passphrase-file` (never pass secrets on the command line).

After one interactive unlock, the CLI remembers your session for **30 minutes** (`cli-vault-session.json` in the data dir, mode 0600). Each subcommand or chat turn extends the timer. Scripted passphrases (`MCP_DETECTIVE_VAULT_PASSPHRASE` / `--passphrase-file`) never use this cache.

### Shell completion (bash)

```bash
mcp-detective add-completions
source ~/.bashrc    # once per open terminal (first time)
```

After the managed block is in `~/.bashrc`, running `mcp-detective add-completions` again reloads completion in the current shell. Tab completes subcommands, nested verbs, and common flags.

## Update

```bash
npm update -g @orenvill/mcp-detective
```

## What it does

Point it at any MCP server:

- **HTTP** — streamable HTTP endpoint (typically `http://host:port/mcp`)
- **Stdio** — local subprocess (`command`, `args`, optional `cwd` and env), same as Cursor/Claude Desktop MCP config

The explorer auto-connects, lists all available tools, and generates input forms from each tool's JSON Schema so you can invoke them immediately from the browser.

**Stdio note:** stdio servers use a local Node bridge built into `mcp-detective`. You must run the app via **`mcp-detective`** (or `npm run dev` from source) — opening static files alone does not spawn subprocesses.

- Add / edit / remove HTTP or stdio MCP servers — persisted to the encrypted vault under `~/.mcp-detective/`
- Editing a server never shows you its stored secrets — a saved password, token, API key, or
  environment value shows as `*****`, with **Change** to replace it
- Stdio bridge for local command-based MCP servers (requires `mcp-detective` or `npm run dev`)
- Local proxy mode for HTTP MCP servers that do not expose browser CORS headers
- Per-server option to accept a self-signed TLS certificate, for development and intranet endpoints
- Auto-discovered tool list via `tools/list`
- Generated forms for strings, numbers, booleans, enums, and JSON objects/arrays
- Protocol Inspector timeline for debugging MCP calls, results, errors, and durations
- Schema Lab for inspecting tool schemas, generating example args, and copying JSON-RPC calls
- Permission Surface audit, Prompt Injection scan, and Observation Journal for MCP trust evaluation
- Agent Readiness scoring with **Copy as Markdown** for a single tool or whole server from Dev Tools
- Meta-tool discovery with one-click **Discover all tools**
- Agent Chat — drive your own model against a connected server, with every tool call approved by you (see below)

## Agent Chat

Click **Chat** in the toolbar to point a model you supply at a connected MCP server and watch how
it actually uses the tools. It is a test-bench for the server, not a chat client — the output is
evidence about the server, not a conversation worth keeping.

Add an **LLM server** from the picker in the chat header: a name, a type (OpenAI-compatible,
Anthropic, or Google Gemini), a base URL (defaults to `http://127.0.0.1:11434/v1` for Ollama), and
an API key only if the provider needs one. MCP Detective asks that server which models it has and lists
them. The key is stored in the same
encrypted vault as your MCP server credentials.

**Local models work without any extra configuration.** The browser never calls the provider
directly — `mcp-detective`'s own local server forwards the request at `/__llm_proxy`, so everything
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
- **Export** the conversation as Markdown or JSON (save to file or copy), with best-effort redaction
  of credentials before you paste it into a bug report.
- **Transcripts are never written to disk.** Only per-server counters persist in `~/.mcp-detective/`;
  the messages and raw tool output live in memory for the session.
- **It always shows you it is working** — dots while the agent has the turn, a caret while text
  streams. Type during a run and the message is queued rather than dropped; Enter sends,
  Shift+Enter adds a line.
- **New chat** clears the conversation, **Retry** re-runs a failed turn without retyping it, and
  any message or tool result can be copied.

A run stops on its own after 8 model turns, and **Stop** cancels whatever is in flight.

## Desktop app

MCP Detective also ships as an Electron desktop app — download an installer from the
[GitHub releases page](https://github.com/OrenVill/mcp-detective/releases/latest). Compared with
this CLI it adds:

- No CORS proxy — MCP requests go out from the Electron main process, so browser CORS never applies
- Stdio servers spawned directly as child processes, with no local HTTP bridge in between
- Vault auto-unlock from the OS keychain where the platform has a real keyring
- Native save dialogs for exports
- Agent Chat provider requests sent straight from the main process, with no local forwarder in between

The builds are unsigned, so macOS and Windows warn on first launch; the README on GitHub has the
click-through steps. There is no auto-update — updating means downloading a newer installer.

The CLI stays fully supported and is the only option for a remote or SSH session, where there is
no desktop to run an app on. Both share `~/.mcp-detective/` (override with `MCP_DETECTIVE_DATA_DIR`), so
running the CLI and the desktop app simultaneously is last-write-wins — use one at a time.

## Full documentation

[github.com/OrenVill/mcp-detective](https://github.com/OrenVill/mcp-detective)

## License

MIT
