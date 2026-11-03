# MCP Detective Terminal CLI — Phase 1–2 Implementation Plan

> **Execution:** Use **`docs/superpowers/plans/2026-11-03-cli-terminal-parallel.md`** for wave gates and parallel agents. This file is a task reference only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship vault-first Node MCP connectivity, interactive/non-interactive subcommands for readiness, trust audits, exports, tool invoke, and vault CRUD—without breaking the existing browser daemon entry.

**Architecture:** Extract `mcp/sessions.js` for Electron + CLI; bundle `src/cli/` to `dist/cli/main.js` with esbuild; subcommands call existing `src/lib` analyzers; Clack for interactive prelude.

**Tech Stack:** Node 20+, TypeScript 6, esbuild, `@clack/prompts`, Vitest, existing `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-11-03-cli-tui-design.md`

## Global Constraints

- Node.js **20+** (package requirement unchanged).
- **No new runtime deps** in root Node modules except what the published CLI bundle includes (`@clack/prompts`; MCP SDK already a dependency).
- Server-side root modules stay **zero-dep** except `stdio-bridge.js` SDK rule — `mcp/sessions.js` may import SDK only.
- Passphrases and API keys **never on argv**; never logged.
- Keep `mcp-detective` with no subcommand as **browser daemon** (backward compatible).
- Last-write-wins on `~/.mcp-detective/` — warn on vault writes.
- TDD for `src/cli/**` and moved MCP tests.

---

## File structure (Phase 1–2)

**Created**

| File | Responsibility |
|------|----------------|
| `mcp/sessions.js` | Shared MCP session manager (moved from `electron/mcp/sessions.js`) |
| `mcp/sessions.test.js` | Tests (moved/updated from electron tree) |
| `scripts/build-cli.mjs` | esbuild: `src/cli/main.ts` → `dist/cli/main.js` |
| `src/cli/main.ts` | argv router, help, dispatch subcommands |
| `src/cli/argv.ts` | Minimal subcommand + global flag parsing |
| `src/cli/exitCodes.ts` | `0` / `1` / `2` constants |
| `src/cli/core/vaultSession.ts` | Unlock/lock, read/write vault.json via fs |
| `src/cli/core/mcpConnect.ts` | Map `StoredServer` → shared session manager |
| `src/cli/core/prelude.ts` | Clack unlock + server pick; non-interactive checks |
| `src/cli/core/discovery.ts` | Optional meta-tool orchestrator wrapper |
| `src/cli/core/appDataNode.ts` | Read gzipped app-data for handoff/history |
| `src/cli/core/llmFetch.ts` | Node fetch + allowlist (stub in phase 1 if unused) |
| `src/cli/commands/readiness.ts` | `readiness` subcommand |
| `src/cli/commands/audit.ts` | `audit permission` / `audit injection` |
| `src/cli/commands/exportCmd.ts` | `export handoff|tools|client-config` |
| `src/cli/commands/call.ts` | `call` subcommand |
| `src/cli/commands/provider.ts` | `provider list|add|remove` |
| `src/cli/commands/server.ts` | `server list|add|remove` |
| `src/cli/core/*.test.ts` | Unit tests per module |
| `src/cli/commands/*.test.ts` | Command wiring tests |
| `tests/cli/smoke.test.ts` | Spawns bundled CLI `--help` |

**Modified**

| File | Change |
|------|--------|
| `electron/mcp/sessions.js` | Re-export from `../../mcp/sessions.js` or delete and update imports |
| `electron/main.js` | Import path to `mcp/sessions.js` |
| `electron-builder.yml` | Allowlist `mcp/sessions.js` |
| `scripts/check-packaged-imports.mjs` | Include new root import |
| `bin/mcp-detective.js` | Delegate unknown first arg to `dist/cli/main.js` |
| `package.json` | `build` runs `build-cli.mjs`; `files` includes `dist/cli`, `mcp/` |
| `README.md`, `README.npm.md` | Terminal CLI section |
| `vitest.config.ts` | Include `src/cli/**` if not already covered |

**Phase 3 (chat TUI only):** see `docs/superpowers/plans/2026-11-03-cli-terminal-tui.md`. Further subcommands (`schema`, `journal`, `replay`, …) extend Wave 4 here before or in parallel with chat.

---

## Wave 0 — Shared MCP extract

### Task 1: Move session manager to repo root

**Files:**
- Create: `mcp/sessions.js` (move body from `electron/mcp/sessions.js`)
- Modify: `electron/mcp/sessions.js` → one-line re-export from `../../mcp/sessions.js`
- Modify: any test imports under `electron/mcp/`
- Test: `mcp/sessions.test.js`

**Interfaces:**
- Produces: same exports as today — `createSessionManager`, `assertSpawnable`, `LOADER_ENV_VARS`, `headersFromAuth`, `isValidServerId`, `createDefaultDeps`.

- [ ] **Step 1:** Move file; fix relative imports (`insecureFetch`, `sessionRecovery` stay under `electron/mcp/` — pass as injected deps or move recovery next to sessions if imports tangle).

- [ ] **Step 2:** Run `npm test -- mcp/sessions.test.js` (or electron path until renamed).

- [ ] **Step 3:** Run `node scripts/check-packaged-imports.mjs` after updating electron-builder list.

- [ ] **Step 4:** Commit `refactor(mcp): share session manager at repo root`.

---

## Wave 1 — CLI build + vault session

### Task 2: esbuild CLI bundle

**Files:**
- Create: `scripts/build-cli.mjs`
- Create: `src/cli/main.ts` (stub: print help, exit 0)
- Modify: `package.json` scripts `"build": "tsc -b && vite build && node scripts/build-cli.mjs"`

**Interfaces:**
- Produces: `dist/cli/main.js` ESM, `#!/usr/bin/env node` banner optional in bin delegate.

- [ ] **Step 1:** Write `build-cli.mjs` targeting `src/cli/main.ts`, platform `node`, format `esm`, bundle `src/lib/**` and `@clack/prompts`.

- [ ] **Step 2:** Run `node scripts/build-cli.mjs` and `node dist/cli/main.js`.

- [ ] **Step 3:** Commit `build: bundle terminal CLI to dist/cli`.

### Task 3: Vault session module (TDD)

**Files:**
- Create: `src/cli/core/vaultSession.ts`
- Create: `src/cli/core/vaultSession.test.ts`
- Test: uses temp dir via `MCP_DETECTIVE_DATA_DIR`

**Interfaces:**
- Produces:
  - `unlockVaultFromDisk(passphrase: string): Promise<{ servers: StoredServer[]; llmConfigs: LlmConfig[]; aesKey: CryptoKey }>`
  - `writeVaultToDisk(aesKey, servers, llmConfigs): Promise<void>`
  - `resolveServerByName(servers, nameOrId): StoredServer`

- [ ] **Step 1:** Failing test — round-trip encrypt/decrypt with `src/lib/vault/envelope` + `crypto.ts` against temp `vault.json`.

- [ ] **Step 2:** Implement minimal unlock/write using `fs/promises` and `data-dir.js` resolved path from env.

- [ ] **Step 3:** `npm test -- src/cli/core/vaultSession.test.ts`

- [ ] **Step 4:** Commit `feat(cli): vault session read/write for Node`.

### Task 4: Wire bin router

**Files:**
- Modify: `bin/mcp-detective.js`
- Modify: `src/cli/main.ts`

**Interfaces:**
- Consumes: first argv token not `stop` and not daemon path → dynamic import `../dist/cli/main.js` relative to pkg root.

- [ ] **Step 1:** If `args[0]` matches known subcommand list (`chat`, `tui`, `readiness`, `audit`, `export`, `call`, `provider`, `server`, `help`), `await import(...)` and call exported `runCli(argv)` (`tui` aliases `chat`).

- [ ] **Step 2:** Add `tests/cli/smoke.test.ts` spawning `node bin/mcp-detective.js help`.

- [ ] **Step 3:** Commit `feat(cli): delegate subcommands to bundled entry`.

---

## Wave 2 — Prelude + readiness

### Task 5: Interactive prelude (TDD)

**Files:**
- Create: `src/cli/core/prelude.ts`, `prelude.test.ts`

**Interfaces:**
- Produces: `resolveVaultAndServer(opts: { serverFlag?: string; passphraseFile?: string; interactive: boolean }): Promise<{ servers; llmConfigs; selected: StoredServer }>`

- [ ] **Step 1:** Test non-TTY without `--server` exits code 2 (mock `process.stdin.isTTY`).

- [ ] **Step 2:** Test `MCP_DETECTIVE_VAULT_PASSPHRASE` + `--server` selects server without prompts.

- [ ] **Step 3:** Implement Clack prompts for TTY path.

- [ ] **Step 4:** Commit `feat(cli): vault unlock and server selection prelude`.

### Task 6: MCP connect helper

**Files:**
- Create: `src/cli/core/mcpConnect.ts`, `mcpConnect.test.ts`

**Interfaces:**
- Produces: `connectServer(stored: StoredServer): Promise<{ tools: ToolDef[]; sessionId: string; listResources; listPrompts; callTool }>` wrapping `createSessionManager` from `mcp/sessions.js`.

- [ ] **Step 1:** Mock session manager; test HTTP server config maps to connect call with auth headers.

- [ ] **Step 2:** Implement stdio + insecure TLS flags from `StoredServer`.

- [ ] **Step 3:** Commit `feat(cli): MCP connect wrapper`.

### Task 7: `readiness` command

**Files:**
- Create: `src/cli/commands/readiness.ts`, `readiness.test.ts`

- [ ] **Step 1:** Test markdown output contains score line and no `apiKey` substring (fixture tools).

- [ ] **Step 2:** Wire `analyzeAgentReadiness` + `serverReadinessMarkdown`; flags `--json`, `-o`.

- [ ] **Step 3:** Register in `main.ts`.

- [ ] **Step 4:** Commit `feat(cli): readiness subcommand`.

---

## Wave 3 — Audit + export

### Task 8: `audit` subcommand

**Files:**
- Create: `src/cli/commands/audit.ts`, `audit.test.ts`

- [ ] **Step 1:** Tests for permission + injection markdown headers.

- [ ] **Step 2:** Implement; share prelude + connect.

- [ ] **Step 3:** Commit `feat(cli): audit permission and injection`.

### Task 9: `export` subcommand

**Files:**
- Create: `src/cli/commands/exportCmd.ts`, `exportCmd.test.ts`
- Create: `src/cli/core/appDataNode.ts` (read-only history for handoff)

- [ ] **Step 1:** Test `export handoff` redaction.

- [ ] **Step 2:** Implement handoff, tools JSON, client-config.

- [ ] **Step 3:** Commit `feat(cli): export subcommands`.

---

## Wave 4 — Automation commands

### Task 10: `call` subcommand

**Files:**
- Create: `src/cli/commands/call.ts`, `call.test.ts`

- [ ] **Step 1:** Test JSON args parse + exit code 1 on tool error (mocked).

- [ ] **Step 2:** Implement.

- [ ] **Step 3:** Commit `feat(cli): call subcommand`.

### Task 11: `provider` and `server` subcommands

**Files:**
- Create: `src/cli/commands/provider.ts`, `server.ts`, tests

- [ ] **Step 1:** Test `provider list` JSON never includes `apiKey` field values.

- [ ] **Step 2:** Implement list/add/remove with hidden prompts for secrets.

- [ ] **Step 3:** Commit `feat(cli): provider and server vault commands`.

### Task 12: Docs + release skill

**Files:**
- Modify: `README.md`, `README.npm.md`, `.cursor/skills/prepare-for-release/SKILL.md`

- [ ] **Step 1:** Document interactive flow (3-step readiness example) and CI env pattern.

- [ ] **Step 2:** Add CLI smoke step to release checklist.

- [ ] **Step 3:** Commit `docs: terminal CLI usage and release gate`.

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Shared mcp/sessions.js | Task 1 |
| Daemon unchanged | Task 4 (only delegates when subcommand) |
| readiness + audit + export | Tasks 7–9 |
| call, provider, server | Tasks 10–11 |
| Non-interactive flags | Task 5 |
| `--discover` | Add to Task 6/7 before closing Wave 2 (optional small step in Task 7) |
| llmFetch | Chat TUI plan (Task 13) |
| Ink | Chat-only plan |
| schema/journal/replay subcommands | Optional Wave 4 extensions (spec phase 2) |
| Redaction tests | Tasks 7, 9, 11 |

**Gap closed in Task 7 follow-up step:** add `--discover` flag calling `src/lib/discovery/orchestrator.ts` after connect.

---

## Execution handoff

Plan complete. Implement **Wave 0 → 4** sequentially; merge before starting **chat-only** Ink plan (Phase 3).

**Execution options:**

1. **Subagent-Driven** — one subagent per task, review between tasks  
2. **Inline** — execute in one session with checkpoints per wave  

Which approach do you want for implementation?
