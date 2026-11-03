# MCP Detective Terminal CLI & TUI Design

**Date:** 2026-11-03  
**Status:** Approved (amended 2026-11-03 — chat-only TUI)

## Goal

Extend `@orenvill/mcp-detective` with a **vault-first terminal experience**: unlock the same encrypted store as the browser/desktop app, connect to saved MCP servers from Node, and run **subcommands** for almost all in-app workflows (readiness, trust audits, exports, tool/resource/prompt access, journal, schema lab, replay/scenario, server/provider management, and more). The only **Ink TUI** is **Agent Chat**—approval-gated, same loop as the web app—not a terminal clone of the 3-column browser UI.

The existing **`mcp-detective` browser daemon** (`start` + `stop`) stays the default when no subcommand is given.

## Non-goals

- Replacing the browser or desktop UI as the primary product surface.
- A full-screen terminal UI for browsing servers, invoking tools, or dev-tool panels (those are **commands**).
- Persisting Agent Chat transcripts to disk (`data.gz` or elsewhere).
- OS keychain auto-unlock in the CLI (desktop-only today).
- CORS proxy toggles in the CLI (Node connects directly).
- Headless one-shot Agent Chat (multi-turn chat lives in `mcp-detective chat` / `tui`).

## Approach (summary)

**Shared CLI core + dual frontends** (see brainstorming option 3):

1. **`bin/mcp-detective.js`** — thin router: no args / `stop` → existing daemon; else delegate to compiled CLI entry.
2. **`cli-core`** — Node-only vault session, MCP session manager (shared with Electron), LLM fetch with `llm-targets.js`, optional app-data I/O, interactive prelude.
3. **Subcommands** — thin wrappers over existing `src/lib/*` (investigation, exports, invoke, journal, replay, etc.).
4. **`mcp-detective chat`** (alias **`tui`**) — Ink UI **only** for Agent Chat (provider pick, in-scope servers, transcript, tool approval).

Business logic stays in `src/lib/`; terminal code only wires I/O and transport.

---

## Entry points & command tree

| Command | Role |
|--------|------|
| `mcp-detective` | *(unchanged)* Daemonize, serve `dist/`, print URL, open browser |
| `mcp-detective stop` | *(unchanged)* Stop daemon via `daemon.json` |
| `mcp-detective chat` | Ink TUI: Agent Chat only (`tui` alias) |
| `mcp-detective readiness [opts]` | Agent Readiness report (interactive or flags) |
| `mcp-detective audit permission` | Permission Surface report |
| `mcp-detective audit injection` | Prompt Injection scan report |
| `mcp-detective export handoff` | Handoff README markdown |
| `mcp-detective export tools` | Tool list JSON |
| `mcp-detective export client-config` | Claude Desktop / Cursor JSON |
| `mcp-detective call <tool>` | Invoke one tool (JSON args) |
| `mcp-detective resource …` / `prompt …` | Read resources / get prompt messages (phase 2+) |
| `mcp-detective schema <tool>` | Schema Lab output for one tool (phase 2+) |
| `mcp-detective journal …` | Observation journal export / append (phase 2+) |
| `mcp-detective replay …` / `scenario …` | Run suite/scenario from JSON (phase 2+) |
| `mcp-detective provider list\|add\|remove` | Vault LLM configs (for Agent Chat) |
| `mcp-detective server list\|add\|remove` | Vault MCP servers |
| `mcp-detective help` | Top-level help |

Global flags (where applicable): `--json`, `-o/--output`, `--server`, `--passphrase-file`, `--discover` (run meta-tool discovery before analysis).

Environment:

| Variable | Purpose |
|----------|---------|
| `MCP_DETECTIVE_VAULT_PASSPHRASE` | Non-interactive vault unlock (protect in CI) |
| `MCP_DETECTIVE_DATA_DIR` | Override data directory (same as app) |

Passphrases and API keys **must never** appear on argv.

---

## Architecture

```text
bin/mcp-detective.js
  ├─ (default) daemon → server.js
  └─ subcommands → dist/cli/main.js

dist/cli/main.js  (esbuild bundle from src/cli/)
  ├─ commands/*
  ├─ chat/*         (Ink — loaded only for `chat` / `tui`)
  └─ core/*
        ├─ vaultSession     → vault.json + src/lib/vault/*
        ├─ mcpSessions      → mcp/sessions.js (shared)
        ├─ llmFetch         → llm-targets.js + src/lib/agent/providers/*
        ├─ appData          → app-data-handler.js + src/lib/appData types
        └─ prelude          → @clack/prompts (interactive)
```

### MCP session manager (shared)

Move `electron/mcp/sessions.js` to **`mcp/sessions.js`** at repo root (alongside `server.js`). Electron main and CLI import the same module. Preserve:

- `createSessionManager`, `assertSpawnable`, `LOADER_ENV_VARS` stripping, `headersFromAuth`, insecure TLS fetch for one host, session recovery helpers.

Update `electron-builder.yml` / `scripts/check-packaged-imports.mjs` if import paths change.

### Vault session

- Read/write `<data dir>/vault.json` using the same envelope as `vault-file-handler.js` and `src/lib/vault/*` (Web Crypto PBKDF2 + AES-GCM; Node 20+ `globalThis.crypto.subtle`).
- In-process unlocked state for the CLI/TUI process lifetime; clear AES key on exit.
- Warn on mutating commands when data dir may be shared with a running desktop app (last-write-wins).

### LLM transport (chat TUI only)

- Node `fetch` from CLI process (no `/__llm_proxy`).
- Validate every request URL with `requireAllowedTarget(provider, url)` from `llm-targets.js`.
- Stream parsing via existing `src/lib/agent/providers/*`.
- API keys from vault `LlmConfig` at request time; never log bodies or auth headers.

### Build & publish

- Add **`src/cli/`** TypeScript compiled/bundled to **`dist/cli/main.js`** via esbuild in `npm run build` (single ESM bundle importing `src/lib` modules).
- Extend npm **`files`** with `dist/cli`, `mcp/sessions.js`, and any new `.d.ts` stubs.
- New runtime deps: **`@clack/prompts`**, **`ink`**, **`react`** (Ink peer — already in devDependencies for app; promote or duplicate as dep for CLI bundle only via esbuild externals policy: bundle ink+react into CLI chunk).

Dependency policy: Clack for subcommand wizards; Ink **only** for `chat` (not for readiness or other reports).

---

## Interactive prelude

When stdin is a TTY and required flags are missing:

1. Prompt **“Unlock your vault”** (hidden).
2. If needed, **“Server:”** select from unlocked servers (display name + transport).

When not a TTY:

- Require `--server` and `MCP_DETECTIVE_VAULT_PASSPHRASE` or `--passphrase-file`; otherwise exit **2** with usage text.

---

## Subcommand behavior

All analysis commands default to **live MCP connect** and `tools/list` (plus optional **`--discover`** meta-tool pass) so output matches the UI.

| Command | Lib modules | Output |
|---------|-------------|--------|
| `readiness` | `analyzeAgentReadiness`, `serverReadinessMarkdown`, optional agent-run summaries from app-data | Markdown or `--json` |
| `audit permission` | `auditPermissionSurface` | Markdown / JSON |
| `audit injection` | `promptInjectionScan` | Markdown / JSON |
| `export handoff` | `generateHandoffReadme` + flags mirroring `HandoffReadmeOptions` | Markdown |
| `export tools` | live tools | JSON |
| `export client-config` | `clientConfigExport` | JSON (redacted secrets) |
| `call` | MCP `callTool` | JSON result; exit 1 on tool error |
| `provider` / `server` | vault CRUD | human table or JSON |

Redaction rules in existing tests (`agentReadinessMarkdown.test.ts`, handoff sensitive keys) apply to all CLI markdown.

---

## Chat TUI (`mcp-detective chat`, alias `tui`)

Single-purpose Ink app—**Agent Chat only**. Everything else (readiness, audits, invoke, journal, replay, etc.) is a **subcommand**, not a TUI panel.

### Startup

Same vault prelude as other commands, then:

1. Pick **LLM provider config** from vault (prompt to run `provider add` if empty).
2. Pick **in-scope MCP servers** (multi-select; connects each via shared MCP session manager).
3. Enter chat UI.

### Chat UI

- Transcript + streaming assistant text + composer.
- Tool proposals → **approval strip** (not default-focused Allow): server, tool, args; Allow/Deny; deny reasons `wrong_tool` | `bad_arguments` | `unsafe` | `no_reason` — same as `ToolCallApproval.tsx` / `DENIAL_TEXT`.
- Uses `runAgentTurn` with Node `llmFetch` + MCP `callTool` + `gating.ts` / `toolCatalog.ts`.
- Key actions where feasible: **record to journal**, **capture replay suite** (same libs as web Agent Chat).
- On run end: persist **`AgentRunSummary`** only via `agentRunStore`; **transcript never written to disk**.

### Out of scope for chat TUI

Server CRUD, tool browser, Protocol Inspector, Schema Lab, standalone readiness/audit panels—use **`server`**, **`call`**, **`readiness`**, **`audit`**, etc.

---

## Phased delivery

| Phase | Deliverable |
|-------|-------------|
| **1** | Shared `mcp/sessions.js`, CLI core, build pipeline, `readiness`, `audit *`, `export handoff` |
| **2** | `call`, exports, `provider`, `server`, optional `schema` / `journal` / `replay` / `scenario` / resource & prompt subcommands |
| **3** | **`chat` TUI only** — Ink, LLM fetch, approval-gated `runAgentTurn` |

Each phase is shippable without blocking the next.

---

## Errors & exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (bad passphrase, MCP failure, tool error) |
| 2 | Usage / missing non-interactive inputs |

User-facing connect errors should reuse `connectionErrorMessage` where applicable.

---

## Security

- No auth material in logs, markdown exports, or `--json` (extend golden tests).
- Stdio spawn validation shared with Electron (`assertSpawnable`, loader env strip).
- LLM allowlist only; http/https only.
- Agent Chat transcripts never written to `data.gz`.
- Document automation env vars in `README.npm.md` with CI secret-handling warning.

---

## Testing

- **Unit:** `src/cli/**/*.test.ts` — vault prelude, argv parsing, command wiring with mocked MCP.
- **Shared MCP:** port existing `electron/mcp/sessions` tests to `mcp/sessions.test.js`.
- **Redaction:** CLI markdown snapshots alongside lib tests.
- **CI smoke:** script or vitest subprocess invoking `node dist/cli/main.js readiness --help`; optional fixture MCP + temp vault for integration.
- **Chat TUI:** approval state-machine tests; full Ink E2E optional later.
- **Release skill:** update when user-visible CLI behavior lands; Playwright remains browser-focused; add CLI smoke to release checklist.

---

## Docs

Update `README.md` and `README.npm.md` with terminal section: subcommands for investigation workflows, interactive readiness example, CI env pattern, **`chat`** for Agent Chat TUI only, coexistence with desktop app data dir.

---

## Related documents

- Prior daemon design: `docs/superpowers/specs/2026-05-23-cli-daemon-design.md`
- **Parallel execution (canonical):** `docs/superpowers/plans/2026-11-03-cli-terminal-parallel.md`
- Task detail archives: `docs/superpowers/plans/2026-11-03-cli-terminal-phase1.md`, `docs/superpowers/plans/2026-11-03-cli-terminal-tui.md`
