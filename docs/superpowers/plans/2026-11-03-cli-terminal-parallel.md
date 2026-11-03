# MCP Detective Terminal CLI — Parallel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use **superpowers:subagent-driven-development** — one agent per task below, **one wave merged before the next wave starts**. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship vault-first CLI subcommands plus **chat-only** Ink TUI (`mcp-detective chat`, alias `tui`), without breaking the browser daemon default.

**Architecture:** Shared `mcp/sessions.js`; esbuild bundle `dist/cli/main.js`; subcommands call `src/lib/*`; parallel agents own **disjoint files** until integration waves.

**Tech Stack:** Node 20+, TypeScript, esbuild, `@clack/prompts`, Ink (chat only), Vitest, MCP SDK.

**Spec:** `docs/superpowers/specs/2026-11-03-cli-tui-design.md`

**Supersedes:** Task detail in `2026-11-03-cli-terminal-phase1.md` and `2026-11-03-cli-terminal-tui.md` — use **this file** for execution order and parallelism.

## Global Constraints

- Node.js **20+**.
- Passphrases and API keys **never on argv**; never logged.
- `mcp-detective` with **no subcommand** remains the browser daemon.
- Root Node modules (except `mcp/sessions.js` SDK imports) stay zero-dep.
- TDD for every new module; `npm test -- <file>` per task; full `npm test` before wave merge.
- Do **not** edit files outside your task's **Files:** list — report blockers instead.

---

## Parallelisation protocol

| Wave | Tasks | Max parallel agents | Blocks on |
|------|-------|---------------------|-----------|
| **0** | C0 contracts | 1 | — |
| **1** | M1 MCP extract | 1 | Wave 0 |
| **2** | B1 build, V1 vault, A1 argv | **3** | Wave 1 |
| **3** | I1 bin delegate | 1 | Wave 2 |
| **4** | P1 prelude, K1 mcpConnect, D1 discovery | **3** | Wave 3 |
| **5** | R1 readiness, U1 audit, X1 export | **3** | Wave 4 |
| **6** | L1 call, G1 provider, S1 server | **3** | Wave 4 |
| **7** | N1 command registry + main wiring | 1 | Waves 5 **and** 6 |
| **8** | DOC1 docs + release skill | 1 | Wave 7 |
| **9** | F1 llmFetch, Q1 multiConnect | **2** | Wave 7 |
| **10** | H1 approval UI tests, J1 chat setup | **2** | Wave 9 |
| **11** | Z1 chat Ink app + loop | 1 | Wave 10 |
| **12** | DOC2 chat docs + ink dep | 1 | Wave 11 |

**Worktrees:** For each wave, branch `feat/cli-terminal-w<N>` from the merged previous wave (or use `superpowers:using-git-worktrees`). Merge bottom-up before spawning the next wave.

**Integration rule:** Tasks in waves 5–6 **must not** edit `src/cli/main.ts` or `src/cli/commands/registry.ts`. Only task **N1** adds imports and switch cases.

---

## Wave 0 — Contracts (serial)

### Task C0: CLI contracts

**Files:**
- Create: `src/cli/exitCodes.ts`
- Create: `src/cli/argv.ts`
- Create: `src/cli/contracts.ts`
- Create: `src/cli/argv.test.ts`

**Produces (do not rename):**

```typescript
// exitCodes.ts
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

// contracts.ts
import type { StoredServer } from '../types'; // or vault storage type
import type { LlmConfig } from '../lib/agent/types';

export type GlobalCliFlags = {
  json?: boolean;
  output?: string;
  server?: string;
  passphraseFile?: string;
  discover?: boolean;
};

export type VaultContext = {
  servers: StoredServer[];
  llmConfigs: LlmConfig[];
  aesKey: CryptoKey;
};

export type CommandHandler = (args: string[], flags: GlobalCliFlags) => Promise<number>;

// argv.ts
export function parseArgv(argv: string[]): {
  command: string | null;
  rest: string[];
  flags: GlobalCliFlags;
};
// Maps global flags: --json, -o/--output, --server, --passphrase-file, --discover
// First positional = subcommand name (chat|tui|readiness|…)
// `tui` normalized to `chat` in parseArgv or in main — pick one place, document in comment
```

- [ ] **Step 1:** Write failing tests for flag parsing and `tui` → `chat` normalization.

- [ ] **Step 2:** Implement.

- [ ] **Step 3:** `npm test -- src/cli/argv.test.ts`

- [ ] **Step 4:** Commit `feat(cli): argv parsing and exit code contracts`

---

## Wave 1 — MCP extract (serial)

### Task M1: Shared session manager

**Files:**
- Create: `mcp/sessions.js` (body from `electron/mcp/sessions.js`)
- Create: `mcp/sessions.test.js` (from `electron/mcp/sessions.test.js`, fix imports)
- Modify: `electron/mcp/sessions.js` → re-export from `../../mcp/sessions.js`
- Modify: `electron/mcp/sessions.test.js` → delete or re-export-only shim pointing at `mcp/sessions.test.js`
- Modify: `electron-builder.yml`, `scripts/check-packaged-imports.mjs`

**Note:** Keep `createInsecureFetch` import from `electron/mcp/insecureFetch.js` inside `mcp/sessions.js` via relative path, or inject via `createDefaultDeps` — do not move insecureFetch unless needed.

- [ ] **Step 1:** Move code; run `npm test -- mcp/sessions.test.js`

- [ ] **Step 2:** `node scripts/check-packaged-imports.mjs`

- [ ] **Step 3:** Commit `refactor(mcp): share session manager at repo root`

---

## Wave 2 — Build + vault + argv (3 parallel agents)

### Task B1: esbuild bundle (Agent A)

**Files:**
- Create: `scripts/build-cli.mjs`
- Create: `src/cli/main.ts` — **stub only**:

```typescript
import { parseArgv } from './argv.js';
import { EXIT_OK, EXIT_USAGE } from './exitCodes.js';

export async function runCli(argv: string[]): Promise<number> {
  const { command, flags } = parseArgv(argv);
  if (!command || command === 'help') {
    process.stdout.write(`mcp-detective — use readiness, audit, export, call, provider, server, chat\n`);
    return EXIT_OK;
  }
  process.stderr.write(`mcp-detective: ${command} not wired yet\n`);
  return EXIT_USAGE;
}
```

- Modify: `package.json` — append `&& node scripts/build-cli.mjs` to `"build"` script only (do not touch dependencies yet)

**Do not** create `commands/` in this task.

- [ ] Build script emits `dist/cli/main.js` (ESM, bundle `src/cli/**` + `@clack/prompts` + `src/lib` as needed).

- [ ] Commit `build: bundle terminal CLI to dist/cli`

### Task V1: Vault session (Agent B)

**Files:**
- Create: `src/cli/core/vaultSession.ts`
- Create: `src/cli/core/vaultSession.test.ts`

**Produces:**

```typescript
export async function unlockVaultFromDisk(passphrase: string): Promise<VaultContext>;
export async function writeVaultToDisk(ctx: VaultContext): Promise<void>;
export function resolveServerByName(servers: StoredServer[], nameOrId: string): StoredServer;
export function warnIfSharedDataDir(): void; // stderr warning once
```

Use `data-dir.js` path + read/write `vault.json` with `src/lib/vault/envelope` + `crypto.ts` (Web Crypto in Node 20).

- [ ] TDD round-trip test with `MCP_DETECTIVE_DATA_DIR` temp dir.

- [ ] Commit `feat(cli): Node vault unlock and write`

### Task A1: (already done in C0 if merged)

If C0 landed argv in Wave 0, **skip A1** — Wave 2 runs **2 agents** (B1 + V1 only). If argv not done, Agent C completes C0 files.

---

## Wave 3 — Bin delegate (serial)

### Task I1: Router in bin

**Files:**
- Modify: `bin/mcp-detective.js`
- Create: `tests/cli/smoke.test.ts`
- Modify: `package.json` `"files"` array — add `"dist/cli"`, `"mcp/sessions.js"` (and `"mcp/"` if needed)

**Behavior:** After `stop` / daemon handling, if first arg is a known subcommand token, dynamic `import('../dist/cli/main.js')` → `runCli(args)`.

Known tokens: `chat`, `tui`, `readiness`, `audit`, `export`, `call`, `provider`, `server`, `help`.

- [ ] Smoke test: build CLI, run `node bin/mcp-detective.js help`.

- [ ] Commit `feat(cli): delegate subcommands to dist/cli`

---

## Wave 4 — Core connect layer (3 parallel)

### Task P1: Prelude (Agent A)

**Files:**
- Create: `src/cli/core/prelude.ts`
- Create: `src/cli/core/prelude.test.ts`

**Produces:**

```typescript
export async function resolveVaultContext(flags: GlobalCliFlags): Promise<VaultContext>;
export async function resolveVaultAndServer(
  flags: GlobalCliFlags,
): Promise<{ ctx: VaultContext; server: StoredServer }>;
```

Uses `MCP_DETECTIVE_VAULT_PASSPHRASE`, `--passphrase-file`, Clack when TTY, exit `EXIT_USAGE` when not.

- [ ] Commit `feat(cli): interactive vault and server prelude`

### Task K1: MCP connect (Agent B)

**Files:**
- Create: `src/cli/core/mcpConnect.ts`
- Create: `src/cli/core/mcpConnect.test.ts`

**Produces:**

```typescript
export type ConnectedServer = {
  tools: ToolDef[];
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  listResources(): Promise<...>;
  listPrompts(): Promise<...>;
  disconnect(): Promise<void>;
};

export async function connectServer(stored: StoredServer): Promise<ConnectedServer>;
```

Wrap `createSessionManager` from `mcp/sessions.js`.

- [ ] Commit `feat(cli): MCP connect wrapper for CLI`

### Task D1: Discovery wrapper (Agent C)

**Files:**
- Create: `src/cli/core/discovery.ts`
- Create: `src/cli/core/discovery.test.ts`

**Produces:**

```typescript
export async function maybeDiscoverTools(
  connected: ConnectedServer,
  nativeTools: ToolDef[],
  discoverFlag: boolean,
): Promise<ToolDef[]>;
```

Calls `src/lib/discovery/orchestrator.ts` when `discoverFlag`.

- [ ] Commit `feat(cli): optional meta-tool discovery wrapper`

---

## Wave 5 — Report commands (3 parallel)

Each handler signature: `(args: string[], flags: GlobalCliFlags) => Promise<number>`

### Task R1: readiness (Agent A)

**Files:** `src/cli/commands/readiness.ts`, `readiness.test.ts`

- [ ] Prelude + connect + optional discover + `analyzeAgentReadiness` + `serverReadinessMarkdown` / JSON.

- [ ] Export `runReadiness` — **do not** register in main.

- [ ] Commit `feat(cli): readiness subcommand`

### Task U1: audit (Agent B)

**Files:** `src/cli/commands/audit.ts`, `audit.test.ts`

- [ ] Subcommands `permission` and `injection` via first arg in `args[0]`.

- [ ] Export `runAudit`.

- [ ] Commit `feat(cli): audit subcommands`

### Task X1: export (Agent C)

**Files:**
- `src/cli/commands/exportCmd.ts`, `exportCmd.test.ts`
- `src/cli/core/appDataNode.ts`, `appDataNode.test.ts`

**Produces:** `loadAppDataForServer(serverId): Promise<{ history, ... }>` read-only via `app-data-handler.js`.

- [ ] Export `runExport`; handoff | tools | client-config via `args[0]`.

- [ ] Commit `feat(cli): export subcommands and app-data reader`

---

## Wave 6 — Invoke + vault CRUD (3 parallel)

### Task L1: call (Agent A)

**Files:** `src/cli/commands/call.ts`, `call.test.ts` — export `runCall`.

### Task G1: provider (Agent B)

**Files:** `src/cli/commands/provider.ts`, `provider.test.ts` — export `runProvider`.

### Task S1: server (Agent C)

**Files:** `src/cli/commands/server.ts`, `server.test.ts` — export `runServer`.

Each: prelude (+ connect for `call` only); vault writes call `warnIfSharedDataDir()`.

- [ ] Commits: `feat(cli): call`, `feat(cli): provider`, `feat(cli): server`

---

## Wave 7 — Registry integration (serial, 1 agent)

### Task N1: Wire all commands

**Files:**
- Create: `src/cli/commands/registry.ts`
- Modify: `src/cli/main.ts`

**registry.ts** imports and maps:

| Key | Handler |
|-----|---------|
| `readiness` | `runReadiness` |
| `audit` | `runAudit` |
| `export` | `runExport` |
| `call` | `runCall` |
| `provider` | `runProvider` |
| `server` | `runServer` |
| `chat` | placeholder import — Wave 11 replaces with `runChat` |

`main.ts`: `parseArgv` → lookup registry → await handler; print help listing all keys.

- [ ] `npm run build && npm test`

- [ ] Commit `feat(cli): register all subcommands`

---

## Wave 8 — Docs (serial)

### Task DOC1: README + release skill

**Files:** `README.md`, `README.npm.md`, `.cursor/skills/prepare-for-release/SKILL.md`

- [ ] Interactive readiness example; CI env vars; subcommand list; note chat comes in Wave 12.

- [ ] Commit `docs: terminal CLI and release smoke`

---

## Wave 9 — Chat prerequisites (2 parallel)

Requires Wave 7 merged.

### Task F1: llmFetch (Agent A)

**Files:** `src/cli/core/llmFetch.ts`, `llmFetch.test.ts`

**Produces:**

```typescript
export function streamChat(
  config: LlmConfig,
  req: { system: string; messages: AgentMessage[]; tools: LlmToolSchema[] },
  signal: AbortSignal,
): AsyncIterable<LlmStreamEvent>;
```

Uses `requireAllowedTarget` from `llm-targets.js` + provider adapters from `src/lib/agent/providers/`.

- [ ] Commit `feat(cli): Node LLM streaming for chat`

### Task Q1: multiConnect (Agent B)

**Files:** `src/cli/core/multiConnect.ts`, `multiConnect.test.ts`

**Produces:**

```typescript
export type ChatMcpDeps = {
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  getTools(): LlmToolSchema[];
  resolve(llmName: string): { serverId: string; toolName: string } | null;
  disconnectAll(): Promise<void>;
};

export async function connectScope(
  serverIds: string[],
  servers: StoredServer[],
): Promise<ChatMcpDeps>;
```

- [ ] Commit `feat(cli): multi-server MCP scope for chat`

---

## Wave 10 — Chat pieces (2 parallel)

### Task H1: Approval logic tests (Agent A)

**Files:**
- Create: `src/cli/chat/approvalState.ts` — pure state machine for pending call + deny reason
- Create: `src/cli/chat/approvalState.test.ts`

No Ink yet — test keys: Allow requires explicit confirm; deny reasons enum.

- [ ] Commit `feat(chat): approval state machine`

### Task J1: Chat setup + command stub (Agent B)

**Files:**
- Create: `src/cli/chat/setupScope.ts` — Clack provider + multi server select; flags `--provider-id`, `--servers id1,id2`
- Create: `src/cli/commands/chat.ts` — export `runChat` (stub: run setup, print "Ink not mounted", exit 0 for now)
- Create: `src/cli/chat/setupScope.test.ts`

**Do not** modify `registry.ts` yet.

- [ ] Commit `feat(chat): scope setup and runChat stub`

---

## Wave 11 — Chat Ink (serial)

### Task Z1: Full chat TUI

**Files:**
- Create: `src/cli/chat/App.tsx`
- Create: `src/cli/chat/Transcript.tsx`
- Create: `src/cli/chat/ApprovalPrompt.tsx` (Ink; uses `approvalState.ts`)
- Create: `src/cli/chat/agentRun.ts` — implements `AgentLoopDeps`
- Create: `src/cli/chat/agentRun.test.ts`
- Modify: `src/cli/commands/chat.ts` — mount Ink, run loop
- Modify: `src/cli/commands/registry.ts` — wire `runChat`
- Modify: `scripts/build-cli.mjs` if Ink/react bundle flags needed

- [ ] `runAgentTurn` + `streamChat` + `connectScope` + gating; summary via `agentRunStore` only.

- [ ] Commit `feat(chat): ink agent chat TUI`

---

## Wave 12 — Chat ship (serial)

### Task DOC2: ink dependency + docs

**Files:**
- Modify: `package.json` — add `ink` to `dependencies`
- Modify: `README.md` — `mcp-detective chat` / `tui` alias, security notes
- Modify: `.cursor/skills/prepare-for-release/SKILL.md` — optional manual chat smoke

- [ ] `npm run build && npm test`

- [ ] Commit `docs: agent chat CLI; chore: add ink dependency`

---

## Optional Wave 13 (parallel, post-MVP)

After Wave 8, agents can add **disjoint** command modules (each exports `run*`; small follow-up integration PR or append to registry in one commit):

| Agent | Files | Command |
|-------|-------|---------|
| O1 | `commands/schema.ts` | `schema <tool>` |
| O2 | `commands/journal.ts` | `journal export` |
| O3 | `commands/replay.ts` | `replay run suite.json` |
| O4 | `commands/scenario.ts` | `scenario run chain.json` |
| O5 | `commands/resource.ts`, `prompt.ts` | resource read / prompt get |

---

## Agent dispatch checklist

When spawning a subagent for task **TX**, paste:

1. This plan file path and **Wave N / Task TX**
2. **Files:** list only
3. **Produces:** signatures from this doc
4. **Do not edit:** any file not listed; do not register in main until N1/Z1
5. Verify: `npm test -- …` then commit message from task

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Shared `mcp/sessions.js` | M1 |
| Subcommands for investigations | R1, U1, X1, L1, G1, S1 |
| Chat-only Ink | Z1, DOC2 |
| Non-interactive flags | P1, C0 |
| `--discover` | D1 + used in R1/U1/X1 |
| Daemon unchanged | I1 (delegate only) |
| Optional schema/journal/replay | Wave 13 |

---

## Execution handoff

**Plan complete:** `docs/superpowers/plans/2026-11-03-cli-terminal-parallel.md`

Run **Wave 0 → 12** sequentially at the wave level; inside each wave, spawn **up to the max parallel agents** shown in the table. Merge each wave before starting the next.

For implementation branch: `feat/cli-terminal` off `main`, or continue design PR branch after merge.
