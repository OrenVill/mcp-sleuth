# Agent Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app chat that drives a user-supplied LLM against a connected MCP server, with every tool call approval-gated and traced, feeding the Observation Journal, Replay Suites, and Agent Readiness.

**Architecture:** All agent logic lives in `src/lib/agent/` as pure modules with their network and MCP dependencies injected. A fourth Host group, `llm`, owns provider HTTP: the browser posts to a new same-origin `/__llm_proxy`, Electron fetches from the main process. The UI is a full-width overlay following the Scenario Runner precedent.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind v4, Vitest, Playwright, Electron. No new npm dependencies — provider calls are hand-rolled `fetch` against vendor HTTP APIs.

**Spec:** `docs/superpowers/specs/2026-08-21-agent-chat-design.md`

---

## Two refinements to the spec

Both are deliberate; implement the plan, not the spec, where they differ.

1. **`LlmHost.chat` returns `AsyncIterable<LlmStreamEvent>`** rather than taking an `onDelta` callback. `loop.ts` is an async generator; yielding events from inside a callback requires a queue and makes the loop untestable without one. An async iterable composes directly with `for await`.
2. **The vault payload becomes an object.** The spec says `LlmConfig` lives in the vault "as a sibling of the server list". The vault currently encrypts a bare `StoredServer[]` array — `parseStoredServers` throws on anything else. Task 2 migrates the payload to `{ version: 2, servers, llmConfigs }` with array-shaped payloads read as v1.

---

## Parallelisation protocol

Tasks are grouped into **waves**. Every task in a wave touches a disjoint set of files, so all tasks in a wave can run concurrently in separate agents. A wave may not start until the previous wave is merged.

**Rules for every agent:**

- Implement **only** the files listed under your task's **Files:**. If you believe you need to edit a file owned by another task, stop and report it rather than editing — a cross-wave edit will be lost in the merge.
- Types and function signatures defined in Wave 0 are a **contract**. Do not change them. If one is wrong, stop and report.
- Run `npm test -- <your test file>` after each step. Run the full `npm test` before your final commit.
- Commit at the end of every task with the message given in the task.

| Wave | Tasks | Agents | Blocks on |
|---|---|---|---|
| 0 | 1 — contracts | 1 | — |
| 1 | 2–9 — pure logic, vault, server side | 8 | Wave 0 |
| 2 | 10–13 — host wiring, persistence, readiness | 4 | Wave 1 |
| 3 | 14–17 — components, replay seam | 4 | Wave 2 |
| 4 | 18–20 — hook, panel, App wiring | 1 (serial) | Wave 3 |
| 5 | 21–23 — e2e suites, docs | 3 | Wave 4 |
| P2 | 24–25 — Anthropic, Gemini | 2 | Wave 5 |

Wave 4 is deliberately serial: the three tasks in it compose each other's output and share `AgentChatPanel.tsx`'s prop surface.

**Worktrees.** Run each wave's agents in separate git worktrees off the same base branch (`feat/agent-chat`), then merge each wave before starting the next. See `superpowers:using-git-worktrees`.

---

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/agent/types.ts` | Every shared type. Imported by all other agent modules. No logic. |
| `src/lib/agent/gating.ts` | Which tool calls need approval and which can be session-allowlisted |
| `src/lib/agent/toolCatalog.ts` | `ServerEntry[]` → provider tool schemas; name → server resolution; collision reporting |
| `src/lib/agent/loop.ts` | The model ↔ tool cycle as an async generator. No network, no MCP client. |
| `src/lib/agent/observations.ts` | `AgentEvent[]` → `AgentRunSummary` |
| `src/lib/agent/providers/index.ts` | `LlmProvider` interface + registry |
| `src/lib/agent/providers/openai.ts` | OpenAI-compatible adapter |
| `src/lib/agent/providers/anthropic.ts` | Anthropic adapter (Phase 2) |
| `src/lib/agent/providers/gemini.ts` | Gemini adapter (Phase 2) |
| `src/lib/agent/agentRunStore.ts` | `AgentRunSummary` persistence over `appData` |
| `src/lib/host/browser/llmBrowser.ts` | Browser `LlmHost` → `/__llm_proxy` |
| `src/lib/host/electron/llmElectron.ts` | Electron `LlmHost` → preload bridge |
| `electron/ipc/llmHandlers.js` | Main-process provider fetch |
| `llm-proxy.js` | Zero-dependency provider forwarder for the browser build |
| `src/components/ToolCallApproval.tsx` | The gate UI, including the deny-reason choice |
| `src/components/AgentTranscript.tsx` | Message and tool-call rendering |
| `src/components/AgentModelPicker.tsx` | Provider/model config + opt-in server checkboxes |
| `src/components/AgentChatPanel.tsx` | Overlay shell; composes the three above |
| `src/components/useAgentRun.ts` | React hook over `loop.ts` |
| `src/lib/agent/providers/types.ts` | The `LlmProvider` interface, split from the registry to avoid an import cycle |
| `src/lib/replaySuiteSession.ts` | Session-lived replay suites, extracted from `ReplaySuitesPanel` so the chat can add one |
| `tests/fixtures/llm-server.mjs` | Scripted fake OpenAI-compatible model for both e2e suites |

**Modified:** `src/lib/host/types.ts`, `src/lib/host/browser/index.ts`, `src/lib/host/electron/index.ts`, `src/lib/vault/service.ts`, `src/hooks/useVault.ts`, `src/lib/appData.ts`, `src/lib/agentReadiness.ts`, `src/App.tsx`, `electron/ipc/channels.js`, `electron/preload.cjs`, `electron/main.js`, `server.js`, `vite.config.ts`, `package.json`, `src/components/ReplaySuitesPanel.tsx`, `playwright.config.ts`, `playwright.electron.config.ts`, `.cursor/skills/prepare-for-release/SKILL.md`, `README.md`, `README.npm.md`, `CLAUDE.md`.

**Deliberately not modified: `electron-builder.yml`.** `llm-proxy.js` is a browser-build file; the desktop app fetches from the main process and never loads it, so it must *not* enter the asar allowlist. `electron/ipc/llmHandlers.js` is already covered by the existing `electron/**` glob. `node scripts/check-packaged-imports.mjs` must still pass after Task 11 — if it fails, `main.js` has grown a root-module import that this plan did not intend.

**One addition to the spec's file list:** `src/lib/agent/providers/types.ts` holds the `LlmProvider` interface, and `providers/index.ts` holds only the registry and the registrations. The spec put both in `index.ts`, which would make every adapter import the module that imports it. Splitting them removes the cycle rather than relying on type-only imports to hide it.

---

# WAVE 0 — Contracts

One agent. Everything else depends on this.

### Task 1: Shared types

**Files:**
- Create: `src/lib/agent/types.ts`
- Modify: `src/lib/host/types.ts`

- [ ] **Step 1: Write `src/lib/agent/types.ts`**

```ts
import type { JsonSchema } from '../../types';

// --- Conversation ---

export type AgentRole = 'user' | 'assistant' | 'tool';

/** A tool call after the LLM's raw name has been resolved to a server. */
export interface AgentToolCall {
  /** Provider-assigned call id; correlates the request with its result. */
  id: string;
  /**
   * The name the model used. Kept separate from `toolName` because provider
   * adapters must re-serialize prior assistant turns using the name the model
   * itself emitted, which sanitizeToolName may have altered.
   */
  llmName: string;
  /** Empty when the model named a tool we could not resolve. */
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface AgentMessage {
  role: AgentRole;
  /** Prose. Empty on an assistant turn that only requested tools. */
  text: string;
  /** Present on assistant messages that requested tools. */
  toolCalls?: AgentToolCall[];
  /** Present on tool messages; matches AgentToolCall.id. */
  toolCallId?: string;
  isError?: boolean;
}

// --- Gating ---

export type DenyReason = 'wrong_tool' | 'bad_arguments' | 'unsafe' | 'no_reason';

export type GateDecision =
  | { kind: 'allow'; remember: boolean }
  | { kind: 'deny'; reason: DenyReason };

/** What the UI must offer for a pending call. */
export type GateVerdict = 'auto' | 'ask' | 'ask_locked';

// --- Events ---

export type AgentEvent =
  | { type: 'model_delta'; text: string }
  | { type: 'model_message'; message: AgentMessage }
  | { type: 'tool_requested'; call: AgentToolCall }
  | { type: 'tool_allowed'; call: AgentToolCall; remembered: boolean }
  | { type: 'tool_denied'; call: AgentToolCall; reason: DenyReason }
  | { type: 'tool_result'; call: AgentToolCall; text: string; isError: boolean }
  | { type: 'turn_limit'; turns: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

// --- Providers ---

export type LlmProviderId = 'openai' | 'anthropic' | 'gemini';

export interface LlmConfig {
  id: string;
  label: string;
  provider: LlmProviderId;
  /** No trailing slash. e.g. https://api.openai.com/v1, http://127.0.0.1:11434/v1 */
  baseUrl: string;
  model: string;
  /** Absent for local models. */
  apiKey?: string;
  extraHeaders?: Record<string, string>;
}

export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface LlmRequest {
  config: LlmConfig;
  system: string;
  messages: AgentMessage[];
  tools: LlmToolSchema[];
}

/** A tool call exactly as the provider named it, before resolution. */
export interface RawToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmResponse {
  text: string;
  toolCalls: RawToolCall[];
}

export type LlmStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'final'; response: LlmResponse };

// --- Persisted signal ---

export interface AgentRunSummary {
  serverId: string;
  runs: number;
  wrongToolPicks: number;
  badArgDenials: number;
  toolErrors: number;
  unrecoveredErrors: number;
  lastRunAt: number;
}

export type AgentRunSummaries = Record<string, AgentRunSummary>;

export const DEFAULT_MAX_TURNS = 8;
```

- [ ] **Step 2: Add `LlmHost` to `src/lib/host/types.ts`**

Add the import at the top of the file:

```ts
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../agent/types';
```

Add this interface immediately above `export interface Host`:

```ts
/**
 * Provider HTTP. The browser routes through the same-origin `/__llm_proxy`
 * because Anthropic requires an explicit browser opt-in header and Ollama
 * rejects cross-origin requests unless the user set OLLAMA_ORIGINS. Electron
 * fetches from main, where CORS does not apply.
 *
 * Tracing is deliberately absent: LLM traffic is not MCP traffic and never
 * enters protocolTrace.ts. The tool calls it causes are traced by mcpClient.ts.
 */
export interface LlmHost {
  chat(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent>;
  /** Model discovery for local servers (Ollama, LM Studio). */
  listModels(config: LlmConfig): Promise<string[]>;
}
```

Add `llm` to the `Host` interface:

```ts
export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
  readonly secrets: SecretsHost;
  readonly updates: UpdateHost;
  readonly llm: LlmHost;
}
```

- [ ] **Step 3: Verify types compile in isolation**

Run: `npx tsc -b --noEmit 2>&1 | head -20`

Expected: errors only of the form `Property 'llm' is missing in type ... browser/index.ts` and the same for `electron/index.ts`. Those two files are filled in by Tasks 10 and 11. No errors inside `src/lib/agent/types.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/types.ts src/lib/host/types.ts
git commit -m "feat(agent): shared agent and LLM host types"
```

---

# WAVE 1 — Pure logic and server side

Eight agents, fully parallel. None of these tasks import each other.

### Task 2: Vault payload v2

The vault encrypts a bare `StoredServer[]`. `LlmConfig` needs a home beside it.

**Files:**
- Modify: `src/lib/vault/service.ts`
- Modify: `src/hooks/useVault.ts`
- Test: `src/lib/vault/payload.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/vault/payload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseVaultPayload, serializeVaultPayload } from './service';

describe('parseVaultPayload', () => {
  it('reads a v1 bare array as servers with no llm configs', () => {
    const raw = JSON.stringify([{ id: 's1', name: 'One', url: 'http://x' }]);
    expect(parseVaultPayload(raw)).toEqual({
      version: 2,
      servers: [{ id: 's1', name: 'One', url: 'http://x' }],
      llmConfigs: [],
    });
  });

  it('reads a v2 object', () => {
    const raw = JSON.stringify({
      version: 2,
      servers: [],
      llmConfigs: [
        { id: 'l1', label: 'Local', provider: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3' },
      ],
    });
    expect(parseVaultPayload(raw).llmConfigs).toHaveLength(1);
  });

  it('defaults missing fields on a malformed object', () => {
    expect(parseVaultPayload(JSON.stringify({ version: 2 }))).toEqual({
      version: 2,
      servers: [],
      llmConfigs: [],
    });
  });

  it('throws on unparseable text', () => {
    expect(() => parseVaultPayload('not json')).toThrow(/unreadable/i);
  });

  it('throws on a payload that is neither array nor object', () => {
    expect(() => parseVaultPayload('42')).toThrow(/invalid/i);
  });

  it('round-trips through serialize', () => {
    const payload = { version: 2 as const, servers: [], llmConfigs: [] };
    expect(parseVaultPayload(serializeVaultPayload(payload))).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/vault/payload.test.ts`
Expected: FAIL — `parseVaultPayload` is not exported from `./service`.

- [ ] **Step 3: Implement in `src/lib/vault/service.ts`**

Add the import:

```ts
import type { LlmConfig } from '../agent/types';
```

Replace the existing `parseStoredServers` function with:

```ts
export interface VaultPayload {
  version: 2;
  servers: StoredServer[];
  llmConfigs: LlmConfig[];
}

/**
 * v1 payloads were a bare StoredServer[]. They are still written by older
 * versions of the app, so an array is read as servers with no LLM configs.
 */
export function parseVaultPayload(jsonText: string): VaultPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Vault data is unreadable. Please reset the vault.');
  }
  if (Array.isArray(parsed)) {
    return { version: 2, servers: parsed as StoredServer[], llmConfigs: [] };
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Vault data is invalid. Please reset the vault.');
  }
  const obj = parsed as Record<string, unknown>;
  return {
    version: 2,
    servers: Array.isArray(obj.servers) ? (obj.servers as StoredServer[]) : [],
    llmConfigs: Array.isArray(obj.llmConfigs) ? (obj.llmConfigs as LlmConfig[]) : [],
  };
}

export function serializeVaultPayload(payload: VaultPayload): string {
  return JSON.stringify(payload);
}
```

Change the three call sites in the same file. `createVault`:

```ts
export async function createVault(
  passphrase: string,
  servers: StoredServer[],
  llmConfigs: LlmConfig[] = [],
): Promise<CryptoKey> {
  const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
  const payload = serializeVaultPayload({ version: 2, servers, llmConfigs });
  const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
  const envelope = envelopeFromParts(
    buildKdfParams(salt, iterations),
    buildCipherBlob(iv, ciphertext),
  );
  await putVaultEnvelope(envelope);
  clearLegacyServers();
  return aesKey;
}
```

`unlockVault`:

```ts
export async function unlockVault(
  passphrase: string,
): Promise<{ aesKey: CryptoKey; servers: StoredServer[]; llmConfigs: LlmConfig[] }> {
  const envelope = requireEnvelope(await getVaultEnvelope());
  const aesKey = await unlockKeyFromEnvelope(passphrase, envelope);
  try {
    const ciphertext = new Uint8Array(fromB64(envelope.cipher.ciphertextB64));
    const plaintext = await decryptUtf8(
      aesKey,
      fromB64(envelope.cipher.ivB64),
      ciphertext,
    );
    const payload = parseVaultPayload(plaintext);
    return { aesKey, servers: payload.servers, llmConfigs: payload.llmConfigs };
  } catch {
    throw new Error('Could not unlock vault. Check your passphrase or reset the vault.');
  }
}
```

`saveVault`:

```ts
export async function saveVault(
  aesKey: CryptoKey,
  servers: StoredServer[],
  llmConfigs: LlmConfig[] = [],
): Promise<void> {
  const envelope = requireEnvelope(await getVaultEnvelope());
  const payload = serializeVaultPayload({ version: 2, servers, llmConfigs });
  const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
  await putVaultEnvelope({
    ...envelope,
    cipher: buildCipherBlob(iv, ciphertext),
    updatedAt: new Date().toISOString(),
  });
}
```

Update `VaultBootstrap` and `bootstrapVault`:

```ts
export type VaultBootstrap =
  | { phase: 'ready'; aesKey: CryptoKey; servers: StoredServer[]; llmConfigs: LlmConfig[] }
  | { phase: 'needs-setup' }
  | { phase: 'needs-unlock' };
```

Inside `bootstrapVault`, the successful auto-unlock branch becomes:

```ts
  if (envelope) {
    try {
      const { aesKey, servers, llmConfigs } = await unlockVault(autoPassphrase);
      return { phase: 'ready', aesKey, servers, llmConfigs };
    } catch {
      return { phase: 'needs-unlock' };
    }
  }

  const legacyServers = loadLegacyServers() ?? [];
  const aesKey = await createVault(autoPassphrase, legacyServers, []);
  return { phase: 'ready', aesKey, servers: legacyServers, llmConfigs: [] };
```

- [ ] **Step 4: Run the payload test**

Run: `npm test -- src/lib/vault/payload.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Update `src/hooks/useVault.ts`**

Add to the hook's state, next to the existing servers state:

```ts
const [llmConfigs, setLlmConfigs] = useState<LlmConfig[]>([]);
const llmConfigsRef = useRef<LlmConfig[]>([]);
```

Import `LlmConfig` from `../lib/agent/types`. Keep `llmConfigsRef.current` in sync wherever `serversRef.current` is synced.

Every `saveVault(...)` call in this file gains a third argument, `llmConfigsRef.current`. The `bootstrapVault` result handler and the `unlockVault` handler both call `setLlmConfigs(result.llmConfigs)`.

Add a persisting setter and return it from the hook:

```ts
const saveLlmConfigs = useCallback((next: LlmConfig[]) => {
  llmConfigsRef.current = next;
  setLlmConfigs(next);
  if (!aesKeyRef.current) return;
  void saveVault(aesKeyRef.current, toStoredServers(serversRef.current), next).catch(
    (err: unknown) => {
      console.error('Failed to persist LLM configs', err);
    },
  );
}, []);
```

Add `llmConfigs` and `saveLlmConfigs` to the hook's return object.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. `src/lib/vault/bootstrap.test.ts` may need its `createVault(...)` assertions updated for the new third parameter — it passes `[]` positionally today, which still compiles. If any assertion compares the `ready` phase object, add `llmConfigs: []` to the expectation.

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: succeeds, apart from the two known `llm` host gaps from Task 1 if Wave 2 has not merged.

- [ ] **Step 8: Commit**

```bash
git add src/lib/vault/service.ts src/lib/vault/payload.test.ts src/hooks/useVault.ts src/lib/vault/bootstrap.test.ts
git commit -m "feat(vault): store LLM configs beside servers in the vault payload"
```

---

### Task 3: Gating rules

**Files:**
- Create: `src/lib/agent/gating.ts`
- Test: `src/lib/agent/gating.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { ToolPermissionProfile } from '../permissionSurfaceAudit';
import { RISK_LOCKED_CATEGORIES, gateVerdict, isRiskLocked, rememberAllowed, toolKey } from './gating';

const profile = (categories: ToolPermissionProfile['categories']): ToolPermissionProfile => ({
  toolName: 'do_thing',
  categories,
  signals: [],
});

const call = { id: 'c1', llmName: 'do_thing', serverId: 's1', toolName: 'do_thing', args: {} };

describe('isRiskLocked', () => {
  it.each(RISK_LOCKED_CATEGORIES)('locks %s', (category) => {
    expect(isRiskLocked(profile([category]))).toBe(true);
  });

  it('does not lock read-only categories', () => {
    expect(isRiskLocked(profile(['data_read', 'network']))).toBe(false);
  });

  it('does not lock a tool with no profile', () => {
    expect(isRiskLocked(undefined)).toBe(false);
  });
});

describe('gateVerdict', () => {
  it('asks when the tool is not allowlisted', () => {
    expect(gateVerdict(call, profile(['data_read']), new Set())).toBe('ask');
  });

  it('auto-allows an allowlisted tool', () => {
    const allowed = new Set([toolKey('s1', 'do_thing')]);
    expect(gateVerdict(call, profile(['data_read']), allowed)).toBe('auto');
  });

  it('asks every time for a risk-locked tool even when allowlisted', () => {
    const allowed = new Set([toolKey('s1', 'do_thing')]);
    expect(gateVerdict(call, profile(['shell']), allowed)).toBe('ask_locked');
  });

  it('keys the allowlist per server, so the same tool name on another server still asks', () => {
    const allowed = new Set([toolKey('s2', 'do_thing')]);
    expect(gateVerdict(call, profile(['data_read']), allowed)).toBe('ask');
  });
});

describe('rememberAllowed', () => {
  it('returns a new set containing the call', () => {
    const before = new Set<string>();
    const after = rememberAllowed(before, call);
    expect(after.has(toolKey('s1', 'do_thing'))).toBe(true);
    expect(before.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/gating.test.ts`
Expected: FAIL — cannot resolve `./gating`.

- [ ] **Step 3: Implement `src/lib/agent/gating.ts`**

```ts
import type { PermissionCategory, ToolPermissionProfile } from '../permissionSurfaceAudit';
import type { AgentToolCall, GateVerdict } from './types';

/**
 * A tool in one of these categories asks on every call and can never be
 * session-allowlisted. These are the categories where a single unreviewed
 * invocation is not recoverable.
 */
export const RISK_LOCKED_CATEGORIES: PermissionCategory[] = [
  'destructive',
  'shell',
  'credential',
  'admin',
];

/** Allowlist entries are per server: the same tool name elsewhere is a different tool. */
export function toolKey(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

export function isRiskLocked(profile: ToolPermissionProfile | undefined): boolean {
  if (!profile) return false;
  return profile.categories.some((category) => RISK_LOCKED_CATEGORIES.includes(category));
}

export function gateVerdict(
  call: AgentToolCall,
  profile: ToolPermissionProfile | undefined,
  allowed: ReadonlySet<string>,
): GateVerdict {
  if (isRiskLocked(profile)) return 'ask_locked';
  return allowed.has(toolKey(call.serverId, call.toolName)) ? 'auto' : 'ask';
}

export function rememberAllowed(
  allowed: ReadonlySet<string>,
  call: AgentToolCall,
): Set<string> {
  return new Set([...allowed, toolKey(call.serverId, call.toolName)]);
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/agent/gating.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/gating.ts src/lib/agent/gating.test.ts
git commit -m "feat(agent): risk-aware tool gating rules"
```

---

### Task 4: Tool catalog

**Files:**
- Create: `src/lib/agent/toolCatalog.ts`
- Test: `src/lib/agent/toolCatalog.test.ts`

Tool names are sent to the provider **raw**, not namespaced. Namespacing would hide the cross-server collision that the opt-in server checkboxes exist to demonstrate. On a collision the first server wins and the loser is recorded in `collisions` so the UI can say so explicitly.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { ServerEntry } from '../../types';
import { buildToolCatalog, sanitizeToolName } from './toolCatalog';

const server = (id: string, name: string, tools: string[]): ServerEntry => ({
  id,
  name,
  url: `http://${id}`,
  status: 'connected',
  tools: tools.map((t) => ({
    name: t,
    description: `does ${t}`,
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
  })),
});

describe('sanitizeToolName', () => {
  it('passes a legal name through', () => {
    expect(sanitizeToolName('list_repos')).toBe('list_repos');
  });

  it('replaces illegal characters', () => {
    expect(sanitizeToolName('list repos!')).toBe('list_repos_');
  });

  it('truncates to 64 characters', () => {
    expect(sanitizeToolName('a'.repeat(100))).toHaveLength(64);
  });
});

describe('buildToolCatalog', () => {
  it('includes only the selected servers', () => {
    const servers = [server('s1', 'One', ['alpha']), server('s2', 'Two', ['beta'])];
    const catalog = buildToolCatalog(servers, ['s1']);
    expect(catalog.tools.map((t) => t.name)).toEqual(['alpha']);
  });

  it('resolves a tool name back to its server', () => {
    const catalog = buildToolCatalog([server('s1', 'One', ['alpha'])], ['s1']);
    expect(catalog.resolve('alpha')).toEqual({ serverId: 's1', toolName: 'alpha' });
  });

  it('returns null for an unknown name', () => {
    const catalog = buildToolCatalog([server('s1', 'One', ['alpha'])], ['s1']);
    expect(catalog.resolve('nope')).toBeNull();
  });

  it('exposes the first server on a name collision and records the loser', () => {
    const servers = [server('s1', 'One', ['search']), server('s2', 'Two', ['search'])];
    const catalog = buildToolCatalog(servers, ['s1', 's2']);
    expect(catalog.tools).toHaveLength(1);
    expect(catalog.resolve('search')).toEqual({ serverId: 's1', toolName: 'search' });
    expect(catalog.collisions).toEqual([
      { llmName: 'search', keptServerId: 's1', droppedServerId: 's2', droppedServerName: 'Two' },
    ]);
  });

  it('skips servers that are not connected', () => {
    const disconnected = { ...server('s1', 'One', ['alpha']), status: 'disconnected' as const };
    expect(buildToolCatalog([disconnected], ['s1']).tools).toHaveLength(0);
  });

  it('carries an empty description through rather than inventing one', () => {
    const s = server('s1', 'One', ['alpha']);
    s.tools![0].description = undefined;
    expect(buildToolCatalog([s], ['s1']).tools[0].description).toBe('');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/toolCatalog.test.ts`
Expected: FAIL — cannot resolve `./toolCatalog`.

- [ ] **Step 3: Implement `src/lib/agent/toolCatalog.ts`**

```ts
import type { ServerEntry } from '../../types';
import { getAllTools } from '../serverTools';
import type { LlmToolSchema } from './types';

const MAX_NAME_LENGTH = 64;

export interface CatalogEntry {
  llmName: string;
  serverId: string;
  toolName: string;
  schema: LlmToolSchema;
}

export interface CatalogCollision {
  llmName: string;
  keptServerId: string;
  droppedServerId: string;
  droppedServerName: string;
}

export interface ToolCatalog {
  entries: CatalogEntry[];
  tools: LlmToolSchema[];
  collisions: CatalogCollision[];
  resolve(llmName: string): { serverId: string; toolName: string } | null;
}

/** Providers accept ^[A-Za-z0-9_-]{1,64}$ for a function name. */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_NAME_LENGTH);
}

/**
 * Names are sent raw, never namespaced. Namespacing would paper over the
 * cross-server collision that opting extra servers in exists to expose, so a
 * collision is surfaced in `collisions` instead of being renamed away.
 */
export function buildToolCatalog(
  servers: ServerEntry[],
  selectedServerIds: string[],
): ToolCatalog {
  const selected = new Set(selectedServerIds);
  const entries: CatalogEntry[] = [];
  const collisions: CatalogCollision[] = [];
  const byName = new Map<string, CatalogEntry>();

  for (const server of servers) {
    if (!selected.has(server.id) || server.status !== 'connected') continue;
    for (const tool of getAllTools(server)) {
      const llmName = sanitizeToolName(tool.name);
      const existing = byName.get(llmName);
      if (existing) {
        collisions.push({
          llmName,
          keptServerId: existing.serverId,
          droppedServerId: server.id,
          droppedServerName: server.name,
        });
        continue;
      }
      const entry: CatalogEntry = {
        llmName,
        serverId: server.id,
        toolName: tool.name,
        schema: {
          name: llmName,
          description: tool.description ?? '',
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
      };
      byName.set(llmName, entry);
      entries.push(entry);
    }
  }

  return {
    entries,
    tools: entries.map((entry) => entry.schema),
    collisions,
    resolve(llmName) {
      const entry = byName.get(llmName);
      return entry ? { serverId: entry.serverId, toolName: entry.toolName } : null;
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/agent/toolCatalog.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/toolCatalog.ts src/lib/agent/toolCatalog.test.ts
git commit -m "feat(agent): build provider tool catalogs with collision reporting"
```

---

### Task 5: The agent loop

The heart of the feature. It touches no network and no MCP client — everything is injected — so every branch is testable.

**Files:**
- Create: `src/lib/agent/loop.ts`
- Test: `src/lib/agent/loop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ToolResult } from '../../types';
import { DENIAL_TEXT, runAgentTurn } from './loop';
import type {
  AgentEvent,
  GateDecision,
  LlmConfig,
  LlmStreamEvent,
  LlmResponse,
} from './types';

const config: LlmConfig = {
  id: 'l1',
  label: 'Test',
  provider: 'openai',
  baseUrl: 'http://x/v1',
  model: 'test',
};

/** Returns a sendToModel that yields the given scripted responses in order. */
function scriptedModel(responses: LlmResponse[]) {
  let index = 0;
  return async function* (): AsyncIterable<LlmStreamEvent> {
    const response = responses[index++] ?? { text: 'done', toolCalls: [] };
    if (response.text) yield { type: 'delta', text: response.text };
    yield { type: 'final', response };
  };
}

const okResult = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });

async function collect(
  iterable: AsyncGenerator<AgentEvent, unknown>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function deps(over: Partial<Parameters<typeof runAgentTurn>[0]> = {}) {
  return {
    sendToModel: scriptedModel([{ text: 'hello', toolCalls: [] }]),
    callTool: vi.fn(async () => okResult('tool ran')),
    gate: vi.fn(async (): Promise<GateDecision> => ({ kind: 'allow', remember: false })),
    resolve: (name: string) => ({ serverId: 's1', toolName: name }),
    maxTurns: 8,
    signal: new AbortController().signal,
    ...over,
  };
}

const init = { config, system: 'you are a test', tools: [] };

describe('runAgentTurn', () => {
  it('emits deltas then a message then done when no tools are called', async () => {
    const events = await collect(runAgentTurn(deps(), { ...init, messages: [] }));
    expect(events.map((e) => e.type)).toEqual(['model_delta', 'model_message', 'done']);
  });

  it('calls an approved tool and feeds the result back to the model', async () => {
    const callTool = vi.fn(async () => okResult('20 repos'));
    const events = await collect(
      runAgentTurn(
        deps({
          callTool,
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'list_repos', args: { limit: 20 } }] },
            { text: 'You have 20.', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    expect(callTool).toHaveBeenCalledWith('s1', 'list_repos', { limit: 20 });
    expect(events.map((e) => e.type)).toEqual([
      'model_message',
      'tool_requested',
      'tool_allowed',
      'tool_result',
      'model_delta',
      'model_message',
      'done',
    ]);
  });

  it('feeds a denial back to the model instead of aborting the run', async () => {
    const callTool = vi.fn(async () => okResult('never'));
    const events = await collect(
      runAgentTurn(
        deps({
          callTool,
          gate: async (): Promise<GateDecision> => ({ kind: 'deny', reason: 'wrong_tool' }),
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'rm_rf', args: {} }] },
            { text: 'Understood, trying another way.', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    expect(callTool).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'tool_denied')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('records the denial reason in the message fed to the model', async () => {
    const gen = runAgentTurn(
      deps({
        gate: async (): Promise<GateDecision> => ({ kind: 'deny', reason: 'bad_arguments' }),
        sendToModel: scriptedModel([
          { text: '', toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
          { text: 'ok', toolCalls: [] },
        ]),
      }),
      { ...init, messages: [] },
    );
    let messages: unknown;
    // Drain, keeping the generator's return value.
    for (;;) {
      const next = await gen.next();
      if (next.done) {
        messages = next.value;
        break;
      }
    }
    expect(JSON.stringify(messages)).toContain(DENIAL_TEXT.bad_arguments);
  });

  it('feeds a tool error back rather than throwing', async () => {
    const events = await collect(
      runAgentTurn(
        deps({
          callTool: vi.fn(async () => {
            throw new Error('connection refused');
          }),
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
            { text: 'That failed.', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ isError: true, text: 'connection refused' });
  });

  it('reports an unresolvable tool name back to the model', async () => {
    const callTool = vi.fn(async () => okResult('never'));
    const events = await collect(
      runAgentTurn(
        deps({
          callTool,
          resolve: () => null,
          sendToModel: scriptedModel([
            { text: '', toolCalls: [{ id: 'c1', name: 'ghost', args: {} }] },
            { text: 'ok', toolCalls: [] },
          ]),
        }),
        { ...init, messages: [] },
      ),
    );
    expect(callTool).not.toHaveBeenCalled();
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ isError: true });
  });

  it('stops at the turn limit', async () => {
    let n = 0;
    const events = await collect(
      runAgentTurn(
        deps({
          maxTurns: 3,
          sendToModel: async function* (): AsyncIterable<LlmStreamEvent> {
            yield {
              type: 'final',
              response: { text: '', toolCalls: [{ id: `c${n++}`, name: 'loop', args: {} }] },
            };
          },
        }),
        { ...init, messages: [] },
      ),
    );
    expect(events.at(-1)).toEqual({ type: 'turn_limit', turns: 3 });
  });

  it('emits an error when the model call throws', async () => {
    const events = await collect(
      runAgentTurn(
        deps({
          sendToModel: async function* (): AsyncIterable<LlmStreamEvent> {
            throw new Error('401 Unauthorized');
            // eslint-disable-next-line no-unreachable
            yield { type: 'final', response: { text: '', toolCalls: [] } };
          },
        }),
        { ...init, messages: [] },
      ),
    );
    expect(events.at(-1)).toEqual({ type: 'error', message: '401 Unauthorized' });
  });

  it('stops immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      runAgentTurn(deps({ signal: controller.signal }), { ...init, messages: [] }),
    );
    expect(events).toEqual([{ type: 'error', message: 'Run cancelled' }]);
  });

  it('passes the accumulated history to each model call', async () => {
    const seen: number[] = [];
    const sendToModel = async function* (req: { messages: unknown[] }) {
      seen.push(req.messages.length);
      yield {
        type: 'final' as const,
        response:
          seen.length === 1
            ? { text: '', toolCalls: [{ id: 'c1', name: 'x', args: {} }] }
            : { text: 'done', toolCalls: [] },
      };
    };
    await collect(
      runAgentTurn(deps({ sendToModel }), {
        ...init,
        messages: [{ role: 'user', text: 'go' }],
      }),
    );
    // turn 1: the user message. turn 2: user + assistant + tool result.
    expect(seen).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/loop.test.ts`
Expected: FAIL — cannot resolve `./loop`.

- [ ] **Step 3: Implement `src/lib/agent/loop.ts`**

```ts
import type { ToolResult } from '../../types';
import type {
  AgentEvent,
  AgentMessage,
  AgentToolCall,
  DenyReason,
  GateDecision,
  LlmConfig,
  LlmStreamEvent,
  LlmToolSchema,
} from './types';

/**
 * A denial is fed back to the model rather than aborting the run: how a model
 * recovers from a refused tool is itself an agent-readiness finding. The reason
 * is included so the model can adapt rather than blindly retry.
 */
export const DENIAL_TEXT: Record<DenyReason, string> = {
  wrong_tool:
    'The user denied this call: this is not the right tool for the request. Choose a different tool.',
  bad_arguments:
    'The user denied this call: the arguments are wrong. Reconsider the arguments before retrying.',
  unsafe: 'The user denied this call as unsafe. Do not retry it.',
  no_reason: 'The user denied this call.',
};

export interface AgentLoopDeps {
  sendToModel(
    req: { config: LlmConfig; system: string; messages: AgentMessage[]; tools: LlmToolSchema[] },
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent>;
  callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult>;
  gate(call: AgentToolCall): Promise<GateDecision>;
  resolve(llmName: string): { serverId: string; toolName: string } | null;
  maxTurns: number;
  signal: AbortSignal;
}

export interface AgentTurnInit {
  config: LlmConfig;
  system: string;
  tools: LlmToolSchema[];
  messages: AgentMessage[];
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Flattens an MCP tool result into the plain text a model can consume. */
export function toolResultText(result: ToolResult): string {
  const parts = result.content
    .map((item) => (typeof item.text === 'string' ? item.text : JSON.stringify(item)))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : '(no content)';
}

/**
 * The model <-> tool cycle. Yields events for the UI; returns the final message
 * history. Performs no network or MCP work itself — everything is injected, so
 * every branch below is reachable in a unit test.
 */
export async function* runAgentTurn(
  deps: AgentLoopDeps,
  init: AgentTurnInit,
): AsyncGenerator<AgentEvent, AgentMessage[]> {
  const messages: AgentMessage[] = [...init.messages];

  for (let turn = 0; turn < deps.maxTurns; turn++) {
    if (deps.signal.aborted) {
      yield { type: 'error', message: 'Run cancelled' };
      return messages;
    }

    let final: LlmStreamEvent | null = null;
    try {
      for await (const event of deps.sendToModel(
        { config: init.config, system: init.system, messages, tools: init.tools },
        deps.signal,
      )) {
        if (event.type === 'delta') {
          yield { type: 'model_delta', text: event.text };
        } else {
          final = event;
        }
      }
    } catch (err) {
      yield { type: 'error', message: errorText(err) };
      return messages;
    }

    if (!final || final.type !== 'final') {
      yield { type: 'error', message: 'The model stream ended without a response.' };
      return messages;
    }

    const raw = final.response.toolCalls;
    const calls: AgentToolCall[] = raw.map((rawCall) => {
      const target = deps.resolve(rawCall.name);
      return {
        id: rawCall.id,
        llmName: rawCall.name,
        serverId: target?.serverId ?? '',
        toolName: target?.toolName ?? rawCall.name,
        args: rawCall.args,
      };
    });

    const assistant: AgentMessage = {
      role: 'assistant',
      text: final.response.text,
      toolCalls: calls.length > 0 ? calls : undefined,
    };
    messages.push(assistant);
    yield { type: 'model_message', message: assistant };

    if (calls.length === 0) {
      yield { type: 'done' };
      return messages;
    }

    for (const call of calls) {
      if (deps.signal.aborted) {
        yield { type: 'error', message: 'Run cancelled' };
        return messages;
      }

      if (!call.serverId) {
        const text = `No tool named "${call.toolName}" is available. Use one of the provided tools.`;
        messages.push({ role: 'tool', toolCallId: call.id, text, isError: true });
        yield { type: 'tool_result', call, text, isError: true };
        continue;
      }

      yield { type: 'tool_requested', call };
      const decision = await deps.gate(call);

      if (decision.kind === 'deny') {
        const text = DENIAL_TEXT[decision.reason];
        yield { type: 'tool_denied', call, reason: decision.reason };
        messages.push({ role: 'tool', toolCallId: call.id, text, isError: true });
        continue;
      }

      yield { type: 'tool_allowed', call, remembered: decision.remember };

      try {
        const result = await deps.callTool(call.serverId, call.toolName, call.args);
        const text = toolResultText(result);
        const isError = result.isError === true;
        messages.push({ role: 'tool', toolCallId: call.id, text, isError });
        yield { type: 'tool_result', call, text, isError };
      } catch (err) {
        const text = errorText(err);
        messages.push({ role: 'tool', toolCallId: call.id, text, isError: true });
        yield { type: 'tool_result', call, text, isError: true };
      }
    }
  }

  yield { type: 'turn_limit', turns: deps.maxTurns };
  return messages;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/agent/loop.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/loop.ts src/lib/agent/loop.test.ts
git commit -m "feat(agent): the model and tool cycle with approval gating"
```

---

### Task 6: Run observations

**Files:**
- Create: `src/lib/agent/observations.ts`
- Test: `src/lib/agent/observations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { emptyRunSummary, summarizeRun } from './observations';
import type { AgentEvent, AgentToolCall } from './types';

const call: AgentToolCall = { id: 'c1', llmName: 'x', serverId: 's1', toolName: 'x', args: {} };
const NOW = 1_700_000_000_000;

describe('summarizeRun', () => {
  it('starts from an empty summary and counts one run', () => {
    const summary = summarizeRun(undefined, 's1', [{ type: 'done' }], NOW);
    expect(summary).toEqual({
      serverId: 's1',
      runs: 1,
      wrongToolPicks: 0,
      badArgDenials: 0,
      toolErrors: 0,
      unrecoveredErrors: 0,
      lastRunAt: NOW,
    });
  });

  it('accumulates onto a previous summary', () => {
    const first = summarizeRun(undefined, 's1', [{ type: 'done' }], NOW);
    const second = summarizeRun(first, 's1', [{ type: 'done' }], NOW + 1000);
    expect(second.runs).toBe(2);
    expect(second.lastRunAt).toBe(NOW + 1000);
  });

  it('counts a wrong-tool denial', () => {
    const events: AgentEvent[] = [
      { type: 'tool_denied', call, reason: 'wrong_tool' },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).wrongToolPicks).toBe(1);
  });

  it('counts a bad-arguments denial', () => {
    const events: AgentEvent[] = [
      { type: 'tool_denied', call, reason: 'bad_arguments' },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).badArgDenials).toBe(1);
  });

  it('does not attribute unsafe or unexplained denials to any counter', () => {
    const events: AgentEvent[] = [
      { type: 'tool_denied', call, reason: 'unsafe' },
      { type: 'tool_denied', call, reason: 'no_reason' },
      { type: 'done' },
    ];
    const summary = summarizeRun(undefined, 's1', events, NOW);
    expect(summary.wrongToolPicks).toBe(0);
    expect(summary.badArgDenials).toBe(0);
  });

  it('counts tool errors', () => {
    const events: AgentEvent[] = [
      { type: 'tool_result', call, text: 'boom', isError: true },
      { type: 'tool_result', call, text: 'fine', isError: false },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).toolErrors).toBe(1);
  });

  it('counts an unrecovered error when the run hit the turn limit', () => {
    const events: AgentEvent[] = [{ type: 'turn_limit', turns: 8 }];
    expect(summarizeRun(undefined, 's1', events, NOW).unrecoveredErrors).toBe(1);
  });

  it('counts an unrecovered error when the run ended on an error', () => {
    const events: AgentEvent[] = [{ type: 'error', message: 'nope' }];
    expect(summarizeRun(undefined, 's1', events, NOW).unrecoveredErrors).toBe(1);
  });

  it('does not count an unrecovered error for a run that finished cleanly', () => {
    const events: AgentEvent[] = [
      { type: 'tool_result', call, text: 'boom', isError: true },
      { type: 'done' },
    ];
    expect(summarizeRun(undefined, 's1', events, NOW).unrecoveredErrors).toBe(0);
  });
});

describe('emptyRunSummary', () => {
  it('zeroes every counter', () => {
    expect(emptyRunSummary('s1')).toMatchObject({ runs: 0, toolErrors: 0, lastRunAt: 0 });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/observations.test.ts`
Expected: FAIL — cannot resolve `./observations`.

- [ ] **Step 3: Implement `src/lib/agent/observations.ts`**

```ts
import type { AgentEvent, AgentRunSummary } from './types';

export function emptyRunSummary(serverId: string): AgentRunSummary {
  return {
    serverId,
    runs: 0,
    wrongToolPicks: 0,
    badArgDenials: 0,
    toolErrors: 0,
    unrecoveredErrors: 0,
    lastRunAt: 0,
  };
}

/**
 * Reduce one run's events into the compact per-server record that Agent
 * Readiness consumes. Deliberately lossy: transcripts are never persisted,
 * because they hold raw tool output from the server under investigation.
 *
 * `unsafe` and `no_reason` denials feed no counter on purpose. If every reason
 * scored, users would be pushed into miscategorising a refusal to make it count.
 */
export function summarizeRun(
  previous: AgentRunSummary | undefined,
  serverId: string,
  events: AgentEvent[],
  now: number,
): AgentRunSummary {
  const base = previous ?? emptyRunSummary(serverId);
  let { wrongToolPicks, badArgDenials, toolErrors, unrecoveredErrors } = base;

  for (const event of events) {
    if (event.type === 'tool_denied') {
      if (event.reason === 'wrong_tool') wrongToolPicks += 1;
      if (event.reason === 'bad_arguments') badArgDenials += 1;
    }
    if (event.type === 'tool_result' && event.isError) toolErrors += 1;
  }

  const last = events.at(-1);
  if (last?.type === 'turn_limit' || last?.type === 'error') unrecoveredErrors += 1;

  return {
    serverId,
    runs: base.runs + 1,
    wrongToolPicks,
    badArgDenials,
    toolErrors,
    unrecoveredErrors,
    lastRunAt: now,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/agent/observations.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/observations.ts src/lib/agent/observations.test.ts
git commit -m "feat(agent): derive a compact run summary from run events"
```

---

### Task 7: Provider interface and the OpenAI-compatible adapter

**Files:**
- Create: `src/lib/agent/providers/types.ts`
- Create: `src/lib/agent/providers/index.ts`
- Create: `src/lib/agent/providers/openai.ts`
- Test: `src/lib/agent/providers/openai.test.ts`

- [ ] **Step 1: Write `src/lib/agent/providers/types.ts`**

No test — it is types only, verified by the adapter tests that implement it.

```ts
import type { LlmConfig, LlmProviderId, LlmRequest, LlmStreamEvent } from '../types';

export interface ProviderHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Incremental parser over the provider's response body. `push` is fed raw text
 * as it arrives and returns whatever complete events that text produced; `end`
 * flushes a final event if the stream closed without an explicit terminator.
 */
export interface LlmStreamParser {
  push(chunk: string): LlmStreamEvent[];
  end(): LlmStreamEvent[];
}

/**
 * One vendor's wire format. An adapter maps our request shape in and the
 * vendor's stream out. It performs no I/O, so it is testable against recorded
 * bytes with no network.
 */
export interface LlmProvider {
  id: LlmProviderId;
  buildRequest(req: LlmRequest): ProviderHttpRequest;
  createStreamParser(): LlmStreamParser;
  modelsRequest(config: LlmConfig): { url: string; headers: Record<string, string> };
  parseModels(payload: unknown): string[];
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/agent/providers/openai.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LlmConfig, LlmRequest } from '../types';
import { openaiProvider, toOpenAiMessages } from './openai';

const config: LlmConfig = {
  id: 'l1',
  label: 'Local',
  provider: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'qwen3',
};

const request: LlmRequest = {
  config,
  system: 'you are a test',
  messages: [{ role: 'user', text: 'list my repos' }],
  tools: [
    {
      name: 'list_repos',
      description: 'lists repos',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    },
  ],
};

/** Feed a whole SSE body through the parser and return every event it produced. */
function runParser(body: string) {
  const parser = openaiProvider.createStreamParser();
  const events = [...parser.push(body), ...parser.end()];
  return events;
}

describe('toOpenAiMessages', () => {
  it('puts the system prompt first', () => {
    expect(toOpenAiMessages('sys', [])[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('serializes an assistant tool call using the name the model emitted', () => {
    const messages = toOpenAiMessages('sys', [
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          { id: 'c1', llmName: 'list_repos', serverId: 's1', toolName: 'list_repos', args: { limit: 20 } },
        ],
      },
    ]);
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'list_repos', arguments: '{"limit":20}' },
        },
      ],
    });
  });

  it('serializes a tool result against its call id', () => {
    const messages = toOpenAiMessages('sys', [
      { role: 'tool', text: '20 repos', toolCallId: 'c1' },
    ]);
    expect(messages[1]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '20 repos' });
  });
});

describe('openaiProvider.buildRequest', () => {
  it('targets the chat completions endpoint', () => {
    expect(openaiProvider.buildRequest(request).url).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    );
  });

  it('omits Authorization when there is no key, for local models', () => {
    expect(openaiProvider.buildRequest(request).headers.Authorization).toBeUndefined();
  });

  it('sends a bearer token when a key is configured', () => {
    const withKey = { ...request, config: { ...config, apiKey: 'sk-test' } };
    expect(openaiProvider.buildRequest(withKey).headers.Authorization).toBe('Bearer sk-test');
  });

  it('merges extra headers', () => {
    const withHeaders = {
      ...request,
      config: { ...config, extraHeaders: { 'X-Trace': 'on' } },
    };
    expect(openaiProvider.buildRequest(withHeaders).headers['X-Trace']).toBe('on');
  });

  it('sends the tool catalog as function definitions', () => {
    const body = openaiProvider.buildRequest(request).body as Record<string, unknown>;
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'list_repos',
          description: 'lists repos',
          parameters: { type: 'object', properties: { limit: { type: 'number' } } },
        },
      },
    ]);
    expect(body.stream).toBe(true);
  });

  it('omits tools entirely when the catalog is empty', () => {
    const noTools = { ...request, tools: [] };
    const body = openaiProvider.buildRequest(noTools).body as Record<string, unknown>;
    expect(body.tools).toBeUndefined();
  });
});

describe('openaiProvider stream parsing', () => {
  it('emits text deltas and a final response', () => {
    const events = runParser(
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n' +
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n' +
        'data: [DONE]\n',
    );
    expect(events).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'final', response: { text: 'Hello', toolCalls: [] } },
    ]);
  });

  it('reassembles a tool call streamed across several chunks', () => {
    const events = runParser(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"list_re"}}]}}]}\n' +
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"pos","arguments":"{\\"lim"}}]}}]}\n' +
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"it\\":20}"}}]}}]}\n' +
        'data: [DONE]\n',
    );
    expect(events.at(-1)).toEqual({
      type: 'final',
      response: { text: '', toolCalls: [{ id: 'c1', name: 'list_repos', args: { limit: 20 } }] },
    });
  });

  it('handles a line split across two push calls', () => {
    const parser = openaiProvider.createStreamParser();
    expect(parser.push('data: {"choices":[{"delta":{"con')).toEqual([]);
    expect(parser.push('tent":"hi"}}]}\n')).toEqual([{ type: 'delta', text: 'hi' }]);
  });

  it('emits a final event when the stream ends without [DONE]', () => {
    const events = runParser('data: {"choices":[{"delta":{"content":"hi"}}]}\n');
    expect(events.at(-1)).toEqual({ type: 'final', response: { text: 'hi', toolCalls: [] } });
  });

  it('does not emit a second final event after [DONE]', () => {
    const events = runParser('data: {"choices":[{"delta":{"content":"hi"}}]}\ndata: [DONE]\n');
    expect(events.filter((e) => e.type === 'final')).toHaveLength(1);
  });

  it('ignores unparseable payloads rather than throwing', () => {
    expect(() => runParser('data: {oh no\ndata: [DONE]\n')).not.toThrow();
  });

  it('falls back to empty arguments when the model streams invalid JSON', () => {
    const events = runParser(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"x","arguments":"{oops"}}]}}]}\n' +
        'data: [DONE]\n',
    );
    expect(events.at(-1)).toMatchObject({
      response: { toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
    });
  });
});

describe('openaiProvider model listing', () => {
  it('targets the models endpoint', () => {
    expect(openaiProvider.modelsRequest(config).url).toBe('http://127.0.0.1:11434/v1/models');
  });

  it('extracts model ids', () => {
    expect(openaiProvider.parseModels({ data: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
  });

  it('returns an empty list for an unexpected payload', () => {
    expect(openaiProvider.parseModels({ nope: true })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/providers/openai.test.ts`
Expected: FAIL — cannot resolve `./openai`.

- [ ] **Step 4: Implement `src/lib/agent/providers/openai.ts`**

```ts
import type {
  AgentMessage,
  LlmConfig,
  LlmRequest,
  LlmStreamEvent,
  RawToolCall,
} from '../types';
import type { LlmProvider, LlmStreamParser, ProviderHttpRequest } from './types';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

export function toOpenAiMessages(system: string, messages: AgentMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text });
      continue;
    }
    if (message.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: message.toolCallId ?? '',
        content: message.text,
      });
      continue;
    }
    const assistant: OpenAiMessage = { role: 'assistant', content: message.text || null };
    if (message.toolCalls && message.toolCalls.length > 0) {
      assistant.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        // The name the model emitted, not our resolved MCP tool name.
        function: { name: call.llmName, arguments: JSON.stringify(call.args) },
      }));
    }
    out.push(assistant);
  }
  return out;
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    // A truncated or malformed argument stream is the model's bug, not ours.
    // Empty args reach the server, which rejects them, and the model sees why.
    return {};
  }
}

function authHeaders(config: LlmConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return { ...headers, ...(config.extraHeaders ?? {}) };
}

function createParser(): LlmStreamParser {
  let buffer = '';
  let text = '';
  let finished = false;
  const calls = new Map<number, { id: string; name: string; args: string }>();

  function finalEvent(): LlmStreamEvent {
    const toolCalls: RawToolCall[] = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        args: parseArgs(call.args),
      }));
    return { type: 'final', response: { text, toolCalls } };
  }

  function handlePayload(raw: string): LlmStreamEvent[] {
    if (raw === '[DONE]') {
      finished = true;
      return [finalEvent()];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    const delta = (parsed as { choices?: { delta?: Record<string, unknown> }[] })?.choices?.[0]
      ?.delta;
    if (!delta) return [];

    const events: LlmStreamEvent[] = [];
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      text += delta.content;
      events.push({ type: 'delta', text: delta.content });
    }

    const fragments = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const fragment of fragments as {
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }[]) {
      const index = typeof fragment.index === 'number' ? fragment.index : 0;
      const entry = calls.get(index) ?? { id: '', name: '', args: '' };
      if (fragment.id) entry.id = fragment.id;
      if (fragment.function?.name) entry.name += fragment.function.name;
      if (fragment.function?.arguments) entry.args += fragment.function.arguments;
      calls.set(index, entry);
    }
    return events;
  }

  return {
    push(chunk: string): LlmStreamEvent[] {
      buffer += chunk;
      const events: LlmStreamEvent[] = [];
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        events.push(...handlePayload(line.slice(5).trim()));
      }
      return events;
    },
    end(): LlmStreamEvent[] {
      // Some servers close the connection instead of sending [DONE].
      return finished ? [] : [finalEvent()];
    },
  };
}

export const openaiProvider: LlmProvider = {
  id: 'openai',

  buildRequest(req: LlmRequest): ProviderHttpRequest {
    const body: Record<string, unknown> = {
      model: req.config.model,
      messages: toOpenAiMessages(req.system, req.messages),
      stream: true,
    };
    if (req.tools.length > 0) {
      body.tools = req.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }
    return {
      url: `${req.config.baseUrl}/chat/completions`,
      headers: authHeaders(req.config),
      body,
    };
  },

  createStreamParser: createParser,

  modelsRequest(config: LlmConfig) {
    return { url: `${config.baseUrl}/models`, headers: authHeaders(config) };
  },

  parseModels(payload: unknown): string[] {
    const data = (payload as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((entry) => (entry as { id?: unknown })?.id)
      .filter((id): id is string => typeof id === 'string');
  },
};
```

- [ ] **Step 5: Run the test**

Run: `npm test -- src/lib/agent/providers/openai.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 6: Write `src/lib/agent/providers/index.ts`**

```ts
import type { LlmProviderId } from '../types';
import { openaiProvider } from './openai';
import type { LlmProvider } from './types';

export type { LlmProvider, LlmStreamParser, ProviderHttpRequest } from './types';

const registry = new Map<LlmProviderId, LlmProvider>();

export function registerProvider(provider: LlmProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: LlmProviderId): LlmProvider {
  const provider = registry.get(id);
  if (!provider) throw new Error(`Unsupported LLM provider "${id}"`);
  return provider;
}

/** Providers wired up in this build. Phase 2 adds anthropic and gemini here. */
export function availableProviderIds(): LlmProviderId[] {
  return [...registry.keys()];
}

registerProvider(openaiProvider);
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/providers
git commit -m "feat(agent): provider registry and the OpenAI-compatible adapter"
```

---

### Task 8: The browser-build LLM proxy

Zero runtime dependencies, matching every other root module. **Not a general relay:** the target must match the named provider's known endpoint paths, so this cannot be used to reach arbitrary hosts.

**Files:**
- Create: `llm-proxy.js`
- Test: `llm-proxy.test.js`
- Modify: `server.js`
- Modify: `vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `llm-proxy.test.js` at the repo root:

```js
import { describe, expect, it } from 'vitest';
import { LLM_PROXY_PATH, handleLlmProxy, isAllowedTarget, isLlmProxyRequest } from './llm-proxy.js';

/** Minimal ServerResponse stand-in that records what the handler wrote. */
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers ?? {};
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
  };
}

describe('isLlmProxyRequest', () => {
  it('matches the bare path', () => {
    expect(isLlmProxyRequest(LLM_PROXY_PATH)).toBe(true);
  });

  it('matches the path with a query string', () => {
    expect(isLlmProxyRequest(`${LLM_PROXY_PATH}?provider=openai`)).toBe(true);
  });

  it('does not match an unrelated path', () => {
    expect(isLlmProxyRequest('/__mcp_proxy')).toBe(false);
  });

  it('does not match a path that merely starts with it', () => {
    expect(isLlmProxyRequest('/__llm_proxyevil')).toBe(false);
  });
});

describe('isAllowedTarget', () => {
  it('allows an OpenAI chat completion on any host, so self-hosted models work', () => {
    expect(isAllowedTarget('openai', new URL('http://127.0.0.1:11434/v1/chat/completions'))).toBe(true);
    expect(isAllowedTarget('openai', new URL('https://api.openai.com/v1/chat/completions'))).toBe(true);
  });

  it('allows the models endpoint', () => {
    expect(isAllowedTarget('openai', new URL('http://127.0.0.1:11434/v1/models'))).toBe(true);
  });

  it('rejects an unrelated path on an allowed host', () => {
    expect(isAllowedTarget('openai', new URL('https://api.openai.com/v1/files'))).toBe(false);
  });

  it('rejects a path that belongs to a different provider', () => {
    expect(isAllowedTarget('openai', new URL('https://api.anthropic.com/v1/messages'))).toBe(false);
  });

  it('allows anthropic and gemini endpoints', () => {
    expect(isAllowedTarget('anthropic', new URL('https://api.anthropic.com/v1/messages'))).toBe(true);
    expect(
      isAllowedTarget('gemini', new URL('https://g.dev/v1beta/models/x:streamGenerateContent')),
    ).toBe(true);
  });

  it('rejects an unknown provider', () => {
    expect(isAllowedTarget('nope', new URL('https://example.com/v1/chat/completions'))).toBe(false);
  });
});

describe('handleLlmProxy rejections', () => {
  it('rejects a missing target', async () => {
    const res = fakeRes();
    await handleLlmProxy({ method: 'POST', url: `${LLM_PROXY_PATH}?provider=openai`, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/target/i);
  });

  it('rejects a missing provider', async () => {
    const res = fakeRes();
    const url = `${LLM_PROXY_PATH}?target=${encodeURIComponent('https://api.openai.com/v1/chat/completions')}`;
    await handleLlmProxy({ method: 'POST', url, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/provider/i);
  });

  it('rejects a non-http target', async () => {
    const res = fakeRes();
    const url = `${LLM_PROXY_PATH}?provider=openai&target=${encodeURIComponent('file:///etc/passwd')}`;
    await handleLlmProxy({ method: 'POST', url, headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a target the provider does not own', async () => {
    const res = fakeRes();
    const url = `${LLM_PROXY_PATH}?provider=openai&target=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}`;
    await handleLlmProxy({ method: 'POST', url, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/not a recognised/i);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- llm-proxy.test.js`
Expected: FAIL — cannot resolve `./llm-proxy.js`.

- [ ] **Step 3: Implement `llm-proxy.js`**

```js
import http from 'node:http';
import https from 'node:https';

export const LLM_PROXY_PATH = '/__llm_proxy';

/**
 * Deliberately narrower than proxy.js. That one forwards to any MCP endpoint the
 * user configured; this one would otherwise be a general-purpose relay reachable
 * from any page the browser has open. Constraining the path to endpoints a
 * provider actually exposes keeps it a forwarder.
 *
 * The host is intentionally unconstrained: Ollama, LM Studio, vLLM and every
 * other self-hosted OpenAI-compatible server lives on an arbitrary host.
 */
const ALLOWED_PATHS = {
  openai: [/\/chat\/completions$/, /\/models$/],
  anthropic: [/\/messages$/, /\/models$/],
  gemini: [/:generateContent$/, /:streamGenerateContent$/, /\/models$/],
};

/** Headers we never forward upstream. */
const STRIPPED = new Set([
  'host',
  'connection',
  'content-length',
  'origin',
  'referer',
  'cookie',
]);

export function isLlmProxyRequest(url) {
  return url === LLM_PROXY_PATH || url.startsWith(`${LLM_PROXY_PATH}?`);
}

export function isAllowedTarget(provider, targetUrl) {
  const patterns = ALLOWED_PATHS[provider];
  if (!patterns) return false;
  return patterns.some((pattern) => pattern.test(targetUrl.pathname));
}

function reject(res, message) {
  res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function forwardHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (STRIPPED.has(key.toLowerCase())) continue;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function handleLlmProxy(req, res) {
  return new Promise((resolve) => {
    const parsed = new URL(req.url ?? '/', 'http://placeholder.invalid');
    const provider = parsed.searchParams.get('provider');
    const target = parsed.searchParams.get('target');

    if (!provider) {
      reject(res, 'Missing "provider" query parameter');
      resolve();
      return;
    }
    if (!target) {
      reject(res, 'Missing "target" query parameter');
      resolve();
      return;
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      reject(res, 'Invalid target URL');
      resolve();
      return;
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      reject(res, 'Only http and https targets are supported');
      resolve();
      return;
    }
    if (!isAllowedTarget(provider, targetUrl)) {
      reject(res, 'Target is not a recognised endpoint for this provider');
      resolve();
      return;
    }

    const lib = targetUrl.protocol === 'https:' ? https : http;
    const upstream = lib.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: forwardHeaders(req.headers),
      },
      (upstreamRes) => {
        // Bodies are never logged: they carry the API key's traffic and the raw
        // output of the server under investigation.
        res.writeHead(upstreamRes.statusCode ?? 502, {
          'Content-Type': upstreamRes.headers['content-type'] ?? 'application/json',
          'Cache-Control': 'no-store',
        });
        upstreamRes.pipe(res);
        upstreamRes.on('end', resolve);
      },
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(`Upstream request failed: ${err.message}`);
      resolve();
    });

    req.pipe(upstream);
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- llm-proxy.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Register in `server.js`**

Add the import beside the existing four:

```js
import { handleLlmProxy, isLlmProxyRequest } from './llm-proxy.js';
```

Add this block immediately after the `isAppDataRequest(url)` block inside `createServer`:

```js
    if (isLlmProxyRequest(url)) {
      handleLlmProxy(req, res).catch((err) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        res.end(err instanceof Error ? err.message : String(err));
      });
      return;
    }
```

- [ ] **Step 6: Register in `vite.config.ts`**

Add the import:

```ts
import { handleLlmProxy, isLlmProxyRequest } from './llm-proxy.js';
```

Add the middleware and plugin, following the `appDataPlugin` pattern exactly:

```ts
function llmProxyMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  if (isLlmProxyRequest(req.url ?? '/')) {
    void handleLlmProxy(req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end(err instanceof Error ? err.message : String(err));
    });
    return;
  }
  next();
}

function llmProxyPlugin(): PluginOption {
  return {
    name: 'mcp-sleuth-llm-proxy',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(llmProxyMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(llmProxyMiddleware);
    },
  };
}
```

Add `llmProxyPlugin()` to the `plugins` array, before `react()`:

```ts
  plugins: [vaultStoragePlugin(), appDataPlugin(), llmProxyPlugin(), react(), tailwindcss(), mcpProxyPlugin()],
```

- [ ] **Step 7: Create `llm-proxy.d.ts`**

The other root modules ship hand-written declarations so `vite.config.ts` type-checks. Match them:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';

export declare const LLM_PROXY_PATH: string;
export declare function isLlmProxyRequest(url: string): boolean;
export declare function isAllowedTarget(provider: string, targetUrl: URL): boolean;
export declare function handleLlmProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void>;
```

- [ ] **Step 8: Add both files to `package.json` `files`**

Insert after `"app-data-handler.d.ts"`:

```json
    "llm-proxy.js",
    "llm-proxy.d.ts",
```

- [ ] **Step 9: Verify the build and the package manifest test**

Run: `npm run build && npm test -- package-files.test.js llm-proxy.test.js`
Expected: build succeeds; both test files PASS.

- [ ] **Step 10: Commit**

```bash
git add llm-proxy.js llm-proxy.d.ts llm-proxy.test.js server.js vite.config.ts package.json
git commit -m "feat(server): same-origin LLM provider proxy for the browser build"
```

---

### Task 9: Scripted fake model fixture

Without this, no part of the feature is testable end to end. It speaks the OpenAI-compatible wire format and replays a fixed script, so both Playwright suites can drive a full agent run with no API key and no network.

**Files:**
- Create: `tests/fixtures/llm-server.mjs`

- [ ] **Step 1: Read the existing MCP fixture for its conventions**

Run: `sed -n '1,40p' tests/fixtures/http-mcp-server.mjs`
Expected: shows how the fixture reads its port and starts. Match that style — argument or `PORT` env, log the listening URL on start.

- [ ] **Step 2: Write `tests/fixtures/llm-server.mjs`**

```js
#!/usr/bin/env node
/**
 * A scripted OpenAI-compatible model for the Playwright suites.
 *
 * Real models are non-deterministic and need a paid key, so neither release
 * suite could assert on an agent run without this. Each request returns the
 * next entry in a fixed script, chosen by how many tool results the request
 * already contains — so turn 1 asks for a tool and turn 2 answers.
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? process.env.LLM_FIXTURE_PORT ?? 3003);

/**
 * Turn 0: call `echo` with a fixed argument.
 * Turn 1 onward: answer in prose, ending the run.
 */
function scriptFor(toolResultCount) {
  if (toolResultCount === 0) {
    return {
      content: '',
      toolCalls: [
        { id: 'call_1', name: 'echo', args: { message: 'hello from the agent' } },
      ],
    };
  }
  return { content: 'The tool replied. We are done.', toolCalls: [] };
}

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamCompletion(res, script) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (script.content) {
    // Two deltas, so the test can observe streaming rather than one blob.
    const half = Math.ceil(script.content.length / 2);
    sse(res, { choices: [{ delta: { content: script.content.slice(0, half) } }] });
    sse(res, { choices: [{ delta: { content: script.content.slice(half) } }] });
  }

  script.toolCalls.forEach((call, index) => {
    sse(res, {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index,
                id: call.id,
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          },
        },
      ],
    });
  });

  res.write('data: [DONE]\n\n');
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
    return;
  }

  if (url.pathname === '/v1/chat/completions') {
    const body = await readBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const toolResults = messages.filter((m) => m.role === 'tool').length;
    streamCompletion(res, scriptFor(toolResults));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LLM fixture listening on http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 3: Verify it runs and streams**

Run:

```bash
node tests/fixtures/llm-server.mjs 3003 &
sleep 1
curl -sS -X POST http://127.0.0.1:3003/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"fixture-model","messages":[{"role":"user","content":"hi"}]}'
echo
curl -sS http://127.0.0.1:3003/v1/models
kill %1
```

Expected: the first curl prints SSE lines including a `tool_calls` delta naming `echo`, then `data: [DONE]`. The second prints `{"data":[{"id":"fixture-model"}]}`.

- [ ] **Step 4: Verify the second turn ends the run**

Run:

```bash
node tests/fixtures/llm-server.mjs 3003 &
sleep 1
curl -sS -X POST http://127.0.0.1:3003/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"fixture-model","messages":[{"role":"user","content":"hi"},{"role":"tool","tool_call_id":"call_1","content":"echoed"}]}'
kill %1
```

Expected: prose deltas and `[DONE]`, with **no** `tool_calls` — this is what stops the loop.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/llm-server.mjs
git commit -m "test: scripted OpenAI-compatible model fixture"
```

---

# WAVE 2 — Host wiring and persistence

Four agents, fully parallel. Wave 1 must be merged first.

### Task 10: Browser LLM host

**Files:**
- Create: `src/lib/host/browser/llmBrowser.ts`
- Test: `src/lib/host/browser/llmBrowser.test.ts`
- Modify: `src/lib/host/browser/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import { llmBrowser } from './llmBrowser';

const config: LlmConfig = {
  id: 'l1',
  label: 'Local',
  provider: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'qwen3',
};

const request: LlmRequest = { config, system: 'sys', messages: [], tools: [] };

/** A Response whose body streams the given text in the given pieces. */
function streamingResponse(pieces: string[], init: { ok?: boolean; status?: number } = {}) {
  const encoder = new TextEncoder();
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    }),
    text: async () => pieces.join(''),
    json: async () => JSON.parse(pieces.join('')),
  } as unknown as Response;
}

async function drain(iterable: AsyncIterable<LlmStreamEvent>) {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('llmBrowser.chat', () => {
  it('posts through the same-origin proxy with the provider and target', async () => {
    const fetchMock = vi.fn(async () => streamingResponse(['data: [DONE]\n']));
    vi.stubGlobal('fetch', fetchMock);

    await drain(llmBrowser.chat(request, new AbortController().signal));

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/__llm_proxy?provider=openai');
    expect(url).toContain(
      `target=${encodeURIComponent('http://127.0.0.1:11434/v1/chat/completions')}`,
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('parses the provider stream into events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamingResponse([
          'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
          'data: [DONE]\n',
        ]),
      ),
    );
    const events = await drain(llmBrowser.chat(request, new AbortController().signal));
    expect(events).toEqual([
      { type: 'delta', text: 'hi' },
      { type: 'final', response: { text: 'hi', toolCalls: [] } },
    ]);
  });

  it('reassembles an event split across two network chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamingResponse(['data: {"choices":[{"delta":{"con', 'tent":"hi"}}]}\ndata: [DONE]\n']),
      ),
    );
    const events = await drain(llmBrowser.chat(request, new AbortController().signal));
    expect(events[0]).toEqual({ type: 'delta', text: 'hi' });
  });

  it('throws with the upstream status and body on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: null,
        text: async () => 'invalid api key',
      })),
    );
    await expect(drain(llmBrowser.chat(request, new AbortController().signal))).rejects.toThrow(
      /401 Unauthorized: invalid api key/,
    );
  });
});

describe('llmBrowser.listModels', () => {
  it('reads model ids through the proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamingResponse(['{"data":[{"id":"a"},{"id":"b"}]}'])),
    );
    expect(await llmBrowser.listModels(config)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/host/browser/llmBrowser.test.ts`
Expected: FAIL — cannot resolve `./llmBrowser`.

- [ ] **Step 3: Implement `src/lib/host/browser/llmBrowser.ts`**

```ts
import { getProvider } from '../../agent/providers';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import type { LlmHost } from '../types';

const LLM_PROXY_PATH = '/__llm_proxy';

/**
 * Provider calls go through the local proxy rather than straight from the page:
 * Anthropic requires an explicit browser opt-in header, and Ollama rejects
 * cross-origin requests unless the user set OLLAMA_ORIGINS. Same-origin makes
 * local models work without the user configuring anything.
 */
function proxyUrl(provider: string, target: string): string {
  const params = new URLSearchParams({ provider, target });
  return `${LLM_PROXY_PATH}?${params.toString()}`;
}

async function describeFailure(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  const detail = body.trim().slice(0, 300);
  return detail
    ? `${res.status} ${res.statusText}: ${detail}`
    : `${res.status} ${res.statusText}`;
}

export const llmBrowser: LlmHost = {
  async *chat(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const provider = getProvider(req.config.provider);
    const { url, headers, body } = provider.buildRequest(req);

    const res = await fetch(proxyUrl(provider.id, url), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(await describeFailure(res));
    }

    const parser = provider.createStreamParser();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          for (const event of parser.push(value)) yield event;
        }
      }
    } finally {
      reader.releaseLock();
    }
    for (const event of parser.end()) yield event;
  },

  async listModels(config: LlmConfig): Promise<string[]> {
    const provider = getProvider(config.provider);
    const { url, headers } = provider.modelsRequest(config);
    const res = await fetch(proxyUrl(provider.id, url), { headers });
    if (!res.ok) throw new Error(await describeFailure(res));
    return provider.parseModels(await res.json());
  },
};
```

- [ ] **Step 4: Wire it into `src/lib/host/browser/index.ts`**

Add the import and the `llm` property to the exported host object:

```ts
import { llmBrowser } from './llmBrowser';
```

```ts
  llm: llmBrowser,
```

- [ ] **Step 5: Run the test and the build**

Run: `npm test -- src/lib/host/browser/llmBrowser.test.ts && npm run build`
Expected: 5 tests PASS. The build may still fail on the Electron host's missing `llm` until Task 11 merges — that is expected in this wave.

- [ ] **Step 6: Commit**

```bash
git add src/lib/host/browser/llmBrowser.ts src/lib/host/browser/llmBrowser.test.ts src/lib/host/browser/index.ts
git commit -m "feat(host): browser LLM host over the same-origin proxy"
```

---

### Task 11: Electron LLM host and IPC

Streaming cannot use a plain `invoke` round trip, so main pushes chunks on a channel keyed by a request id, exactly like the existing `toolsChanged` push.

**Files:**
- Create: `src/lib/host/electron/llmElectron.ts`
- Create: `electron/ipc/llmHandlers.js`
- Test: `src/lib/host/electron/llmElectron.test.ts`
- Test: `electron/ipc/llmHandlers.test.js`
- Modify: `electron/ipc/channels.js`
- Modify: `electron/preload.cjs`
- Modify: `electron/main.js`
- Modify: `src/lib/host/electron/index.ts`

- [ ] **Step 1: Add the channel names to `electron/ipc/channels.js`**

Add to the `CHANNELS` object, after the updates block:

```js
  // llm
  llmChatStart: 'mcp:llmChatStart',
  llmChatAbort: 'mcp:llmChatAbort',
  llmListModels: 'mcp:llmListModels',
  // main → renderer pushes
  llmChunk: 'mcp:llmChunk',
  llmDone: 'mcp:llmDone',
  llmError: 'mcp:llmError',
```

- [ ] **Step 2: Write the failing handler test**

Create `electron/ipc/llmHandlers.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { createLlmService } from './llmHandlers.js';

function fakeSender() {
  return { sent: [], send(channel, payload) { this.sent.push({ channel, payload }); } };
}

function streamingFetch(pieces, init = {}) {
  const encoder = new TextEncoder();
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    text: async () => pieces.join(''),
    json: async () => JSON.parse(pieces.join('')),
    body: new ReadableStream({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    }),
  }));
}

const payload = {
  requestId: 'r1',
  url: 'http://127.0.0.1:11434/v1/chat/completions',
  headers: { 'Content-Type': 'application/json' },
  body: { model: 'qwen3' },
};

describe('createLlmService', () => {
  it('streams chunks then done to the sender', async () => {
    const sender = fakeSender();
    const service = createLlmService({ fetchImpl: streamingFetch(['abc', 'def']) });
    await service.start(sender, payload);
    expect(sender.sent).toEqual([
      { channel: 'chunk', payload: { requestId: 'r1', chunk: 'abc' } },
      { channel: 'chunk', payload: { requestId: 'r1', chunk: 'def' } },
      { channel: 'done', payload: { requestId: 'r1' } },
    ]);
  });

  it('sends an error with the upstream status when the request fails', async () => {
    const sender = fakeSender();
    const service = createLlmService({
      fetchImpl: streamingFetch(['bad key'], { ok: false, status: 401, statusText: 'Unauthorized' }),
    });
    await service.start(sender, payload);
    expect(sender.sent).toEqual([
      { channel: 'error', payload: { requestId: 'r1', message: '401 Unauthorized: bad key' } },
    ]);
  });

  it('sends an error when fetch throws', async () => {
    const sender = fakeSender();
    const service = createLlmService({
      fetchImpl: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
    });
    await service.start(sender, payload);
    expect(sender.sent[0]).toEqual({
      channel: 'error',
      payload: { requestId: 'r1', message: 'ECONNREFUSED' },
    });
  });

  it('aborts an in-flight request', async () => {
    const service = createLlmService({ fetchImpl: streamingFetch(['x']) });
    const sender = fakeSender();
    const running = service.start(sender, payload);
    service.abort('r1');
    await running;
    // Aborting an unknown id is a no-op rather than a throw.
    expect(() => service.abort('does-not-exist')).not.toThrow();
  });

  it('lists models', async () => {
    const service = createLlmService({
      fetchImpl: streamingFetch(['{"data":[{"id":"a"}]}']),
    });
    const result = await service.listModels({ url: 'http://x/v1/models', headers: {} });
    expect(result).toEqual({ data: [{ id: 'a' }] });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- electron/ipc/llmHandlers.test.js`
Expected: FAIL — cannot resolve `./llmHandlers.js`.

- [ ] **Step 4: Implement `electron/ipc/llmHandlers.js`**

The channel names used by the sender are abstracted so the unit test can assert on `chunk`/`done`/`error` without importing Electron.

```js
/**
 * Provider HTTP from the main process. Electron has no CORS and no proxy, so
 * this is a direct fetch — matching how MCP already leaves the main process.
 *
 * `fetchImpl` is injected so this is testable without sockets, following the
 * pattern in electron/mcp/sessions.js. Bodies are never logged: they carry the
 * API key's traffic and raw output from the server under investigation.
 */
export function createLlmService({ fetchImpl = fetch, channels = {
  chunk: 'chunk',
  done: 'done',
  error: 'error',
} } = {}) {
  const inflight = new Map();

  async function start(sender, { requestId, url, headers, body }) {
    const controller = new AbortController();
    inflight.set(requestId, controller);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = (await res.text().catch(() => '')).trim().slice(0, 300);
        const message = detail
          ? `${res.status} ${res.statusText}: ${detail}`
          : `${res.status} ${res.statusText}`;
        sender.send(channels.error, { requestId, message });
        return;
      }

      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          sender.send(channels.chunk, {
            requestId,
            chunk: decoder.decode(value, { stream: true }),
          });
        }
      }
      sender.send(channels.done, { requestId });
    } catch (err) {
      // An abort is a user action, not a failure, but the renderer still needs
      // the stream closed, so it is reported the same way.
      sender.send(channels.error, {
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inflight.delete(requestId);
    }
  }

  function abort(requestId) {
    const controller = inflight.get(requestId);
    if (!controller) return;
    controller.abort();
    inflight.delete(requestId);
  }

  async function listModels({ url, headers }) {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).trim().slice(0, 300);
      throw new Error(
        detail ? `${res.status} ${res.statusText}: ${detail}` : `${res.status} ${res.statusText}`,
      );
    }
    return res.json();
  }

  return { start, abort, listModels };
}

/** Registers the IPC surface. Called from electron/main.js. */
export function registerLlmHandlers(ipcMain, CHANNELS, ok, fail) {
  const service = createLlmService({
    channels: {
      chunk: CHANNELS.llmChunk,
      done: CHANNELS.llmDone,
      error: CHANNELS.llmError,
    },
  });

  ipcMain.handle(CHANNELS.llmChatStart, async (event, payload) => {
    // Deliberately not awaited: the reply must return immediately so the
    // renderer can start listening while chunks stream in.
    void service.start(event.sender, payload);
    return ok(true);
  });

  ipcMain.handle(CHANNELS.llmChatAbort, async (_event, requestId) => {
    service.abort(requestId);
    return ok(true);
  });

  ipcMain.handle(CHANNELS.llmListModels, async (_event, payload) => {
    try {
      return ok(await service.listModels(payload));
    } catch (err) {
      return fail(err, 'E_LLM_MODELS');
    }
  });
}
```

- [ ] **Step 5: Run the handler test**

Run: `npm test -- electron/ipc/llmHandlers.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 6: Extend `electron/preload.cjs`**

Channel names are duplicated here on purpose — a sandboxed preload cannot import the ESM `channels.js`. Add to the exposed object:

```js
  llmChatStart: (payload) => ipcRenderer.invoke('mcp:llmChatStart', payload),
  llmChatAbort: (requestId) => ipcRenderer.invoke('mcp:llmChatAbort', requestId),
  llmListModels: (payload) => ipcRenderer.invoke('mcp:llmListModels', payload),
  onLlmChunk: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('mcp:llmChunk', listener);
    return () => ipcRenderer.removeListener('mcp:llmChunk', listener);
  },
  onLlmDone: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('mcp:llmDone', listener);
    return () => ipcRenderer.removeListener('mcp:llmDone', listener);
  },
  onLlmError: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('mcp:llmError', listener);
    return () => ipcRenderer.removeListener('mcp:llmError', listener);
  },
```

- [ ] **Step 7: Register in `electron/main.js`**

Add the import beside the other handler registrations:

```js
import { registerLlmHandlers } from './ipc/llmHandlers.js';
```

Call it where the other `register*Handlers` calls happen, passing the same `ipcMain`, `CHANNELS`, `ok`, and `fail` those calls already use:

```js
registerLlmHandlers(ipcMain, CHANNELS, ok, fail);
```

- [ ] **Step 8: Write the failing renderer-host test**

Create `src/lib/host/electron/llmElectron.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import { createLlmElectron } from './llmElectron';

const config: LlmConfig = {
  id: 'l1',
  label: 'Local',
  provider: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'qwen3',
};
const request: LlmRequest = { config, system: 'sys', messages: [], tools: [] };

/** A bridge stand-in that lets the test drive the push channels by hand. */
function fakeBridge() {
  const handlers: Record<string, ((p: unknown) => void)[]> = {
    chunk: [],
    done: [],
    error: [],
  };
  const emit = (kind: keyof typeof handlers, payload: unknown) =>
    handlers[kind].forEach((h) => h(payload));
  return {
    emit,
    started: [] as unknown[],
    aborted: [] as unknown[],
    llmChatStart: vi.fn(async function (this: void, payload: unknown) {
      bridge.started.push(payload);
      return { ok: true, value: true };
    }),
    llmChatAbort: vi.fn(async (requestId: unknown) => {
      bridge.aborted.push(requestId);
      return { ok: true, value: true };
    }),
    llmListModels: vi.fn(async () => ({ ok: true, value: { data: [{ id: 'a' }] } })),
    onLlmChunk: (h: (p: unknown) => void) => {
      handlers.chunk.push(h);
      return () => {};
    },
    onLlmDone: (h: (p: unknown) => void) => {
      handlers.done.push(h);
      return () => {};
    },
    onLlmError: (h: (p: unknown) => void) => {
      handlers.error.push(h);
      return () => {};
    },
  };
}
let bridge = fakeBridge();

async function collect(iterable: AsyncIterable<LlmStreamEvent>) {
  const events: LlmStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe('createLlmElectron', () => {
  it('parses chunks pushed from main into events', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const iterable = host.chat(request, new AbortController().signal);
    const pending = collect(iterable);

    // Let the generator subscribe before main starts pushing.
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    bridge.emit('chunk', { requestId, chunk: 'data: {"choices":[{"delta":{"content":"hi"}}]}\n' });
    bridge.emit('chunk', { requestId, chunk: 'data: [DONE]\n' });
    bridge.emit('done', { requestId });

    expect(await pending).toEqual([
      { type: 'delta', text: 'hi' },
      { type: 'final', response: { text: 'hi', toolCalls: [] } },
    ]);
  });

  it('ignores chunks belonging to another request', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const pending = collect(host.chat(request, new AbortController().signal));
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    bridge.emit('chunk', { requestId: 'someone-else', chunk: 'data: [DONE]\n' });
    bridge.emit('chunk', { requestId, chunk: 'data: [DONE]\n' });
    bridge.emit('done', { requestId });
    expect(await pending).toEqual([{ type: 'final', response: { text: '', toolCalls: [] } }]);
  });

  it('rejects when main reports an error', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const pending = collect(host.chat(request, new AbortController().signal));
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    bridge.emit('error', { requestId, message: '401 Unauthorized' });
    await expect(pending).rejects.toThrow('401 Unauthorized');
  });

  it('tells main to abort when the signal fires', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    const controller = new AbortController();
    const pending = collect(host.chat(request, controller.signal));
    await Promise.resolve();
    const requestId = (bridge.started[0] as { requestId: string }).requestId;
    controller.abort();
    bridge.emit('error', { requestId, message: 'aborted' });
    await expect(pending).rejects.toThrow();
    expect(bridge.aborted).toEqual([requestId]);
  });

  it('lists models through the bridge', async () => {
    bridge = fakeBridge();
    const host = createLlmElectron(bridge as never);
    expect(await host.listModels(config)).toEqual(['a']);
  });
});
```

- [ ] **Step 9: Run it to confirm it fails**

Run: `npm test -- src/lib/host/electron/llmElectron.test.ts`
Expected: FAIL — cannot resolve `./llmElectron`.

- [ ] **Step 10: Implement `src/lib/host/electron/llmElectron.ts`**

```ts
import { getProvider } from '../../agent/providers';
import type { LlmConfig, LlmRequest, LlmStreamEvent } from '../../agent/types';
import type { LlmHost } from '../types';

type Envelope<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

export interface LlmBridge {
  llmChatStart(payload: {
    requestId: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
  }): Promise<Envelope<boolean>>;
  llmChatAbort(requestId: string): Promise<Envelope<boolean>>;
  llmListModels(payload: {
    url: string;
    headers: Record<string, string>;
  }): Promise<Envelope<unknown>>;
  onLlmChunk(handler: (p: { requestId: string; chunk: string }) => void): () => void;
  onLlmDone(handler: (p: { requestId: string }) => void): () => void;
  onLlmError(handler: (p: { requestId: string; message: string }) => void): () => void;
}

let counter = 0;
function nextRequestId(): string {
  counter += 1;
  return `llm-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

function unwrap<T>(envelope: Envelope<T>): T {
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.value;
}

/**
 * Main streams raw provider bytes back on a push channel keyed by request id;
 * parsing stays here so both hosts share one adapter. The queue exists because
 * chunks arrive from an event callback while the consumer awaits a generator.
 */
export function createLlmElectron(bridge: LlmBridge): LlmHost {
  return {
    async *chat(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
      const provider = getProvider(req.config.provider);
      const { url, headers, body } = provider.buildRequest(req);
      const requestId = nextRequestId();
      const parser = provider.createStreamParser();

      const queue: LlmStreamEvent[] = [];
      let finished = false;
      let failure: Error | null = null;
      let wake: (() => void) | null = null;
      const bump = () => {
        wake?.();
        wake = null;
      };

      const offChunk = bridge.onLlmChunk((payload) => {
        if (payload.requestId !== requestId) return;
        queue.push(...parser.push(payload.chunk));
        bump();
      });
      const offDone = bridge.onLlmDone((payload) => {
        if (payload.requestId !== requestId) return;
        queue.push(...parser.end());
        finished = true;
        bump();
      });
      const offError = bridge.onLlmError((payload) => {
        if (payload.requestId !== requestId) return;
        failure = new Error(payload.message);
        finished = true;
        bump();
      });

      const onAbort = () => {
        void bridge.llmChatAbort(requestId);
      };
      signal.addEventListener('abort', onAbort);

      try {
        unwrap(await bridge.llmChatStart({ requestId, url, headers, body }));
        for (;;) {
          while (queue.length > 0) yield queue.shift() as LlmStreamEvent;
          if (failure) throw failure;
          if (finished) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
        offChunk();
        offDone();
        offError();
      }
    },

    async listModels(config: LlmConfig): Promise<string[]> {
      const provider = getProvider(config.provider);
      const { url, headers } = provider.modelsRequest(config);
      const payload = unwrap(await bridge.llmListModels({ url, headers }));
      return provider.parseModels(payload);
    },
  };
}
```

- [ ] **Step 11: Wire it into `src/lib/host/electron/index.ts`**

Add the import and the `llm` property to the host that `createElectronHost` returns:

```ts
import { createLlmElectron } from './llmElectron';
```

```ts
    llm: createLlmElectron(bridge as unknown as LlmBridge),
```

Extend the `ElectronBridge` type in `mcpElectron.ts` to include the six LLM members, or intersect it with `LlmBridge` where `createElectronHost` declares its parameter — whichever matches the file's existing style.

- [ ] **Step 12: Run the tests, build, and the packaging check**

Run: `npm test && npm run build && node scripts/check-packaged-imports.mjs`
Expected: all PASS. The packaging check must still pass — `llmHandlers.js` lives under `electron/`, already covered by the `electron/**` glob, and imports no new root module.

- [ ] **Step 13: Commit**

```bash
git add src/lib/host/electron electron/ipc/channels.js electron/ipc/llmHandlers.js electron/ipc/llmHandlers.test.js electron/preload.cjs electron/main.js
git commit -m "feat(host): Electron LLM host streaming from the main process"
```

---

### Task 12: Persist run summaries

**Files:**
- Create: `src/lib/agent/agentRunStore.ts`
- Test: `src/lib/agent/agentRunStore.test.ts`
- Modify: `src/lib/appData.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetCache, _seedCache } from '../appData';
import { getAgentRunSummaries, getAgentRunSummary, recordAgentRun } from './agentRunStore';
import type { AgentEvent } from './types';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  _resetCache();
  _seedCache({ version: 2, bookmarks: [], history: [], observationJournals: {}, agentRuns: {} });
});

describe('agentRunStore', () => {
  it('returns undefined for a server with no runs', () => {
    expect(getAgentRunSummary('s1')).toBeUndefined();
  });

  it('records a run', () => {
    const events: AgentEvent[] = [{ type: 'done' }];
    recordAgentRun('s1', events, NOW);
    expect(getAgentRunSummary('s1')).toMatchObject({ serverId: 's1', runs: 1, lastRunAt: NOW });
  });

  it('accumulates across runs', () => {
    recordAgentRun('s1', [{ type: 'done' }], NOW);
    recordAgentRun('s1', [{ type: 'turn_limit', turns: 8 }], NOW + 1);
    const summary = getAgentRunSummary('s1');
    expect(summary).toMatchObject({ runs: 2, unrecoveredErrors: 1 });
  });

  it('keeps servers separate', () => {
    recordAgentRun('s1', [{ type: 'done' }], NOW);
    recordAgentRun('s2', [{ type: 'done' }], NOW);
    expect(Object.keys(getAgentRunSummaries())).toEqual(['s1', 's2']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/agentRunStore.test.ts`
Expected: FAIL — `agentRuns` is not a property of `AppData`, and `./agentRunStore` does not resolve.

- [ ] **Step 3: Extend `src/lib/appData.ts`**

Add the import:

```ts
import type { AgentRunSummaries } from './agent/types';
```

Extend the interface and default:

```ts
export interface AppData {
  version: number;
  bookmarks: string[];
  history: CallRecord[];
  observationJournals: ObservationJournalsStore;
  /** Derived per-server agent-run signal. Transcripts are never stored here. */
  agentRuns: AgentRunSummaries;
}

const DEFAULT: AppData = {
  version: 2,
  bookmarks: [],
  history: [],
  observationJournals: {},
  agentRuns: {},
};
```

In `parseAppData`, add the field with the same defaulting the others use, so v1 data loads unchanged:

```ts
    agentRuns:
      obj.agentRuns && typeof obj.agentRuns === 'object' && !Array.isArray(obj.agentRuns)
        ? (obj.agentRuns as AgentRunSummaries)
        : {},
```

Bump the version default it writes:

```ts
    version: typeof obj.version === 'number' ? obj.version : 2,
```

Check the rest of `parseAppData` and `loadFromLocalStorage` for any object literal that constructs an `AppData` and add `agentRuns: {}` to each — TypeScript will point at every one.

- [ ] **Step 4: Implement `src/lib/agent/agentRunStore.ts`**

```ts
import { getAppData, patchAppData } from '../appData';
import { summarizeRun } from './observations';
import type { AgentEvent, AgentRunSummaries, AgentRunSummary } from './types';

export function getAgentRunSummaries(): AgentRunSummaries {
  return getAppData().agentRuns;
}

export function getAgentRunSummary(serverId: string): AgentRunSummary | undefined {
  return getAgentRunSummaries()[serverId];
}

/**
 * Fold one finished run into the server's summary. Only derived counters are
 * written — the transcript holds raw output from the server under investigation
 * and is deliberately never persisted.
 */
export function recordAgentRun(
  serverId: string,
  events: AgentEvent[],
  now: number = Date.now(),
): AgentRunSummary {
  const summaries = getAgentRunSummaries();
  const next = summarizeRun(summaries[serverId], serverId, events, now);
  patchAppData({ agentRuns: { ...summaries, [serverId]: next } });
  return next;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/lib/agent/agentRunStore.test.ts src/lib/appData.test.ts`
Expected: PASS. Any existing `appData` test constructing an `AppData` literal needs `agentRuns: {}` added.

- [ ] **Step 6: Run the whole suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/agentRunStore.ts src/lib/agent/agentRunStore.test.ts src/lib/appData.ts src/lib/appData.test.ts
git commit -m "feat(agent): persist derived per-server run summaries"
```

---

### Task 13: Agent Readiness signal

`analyzeToolReadiness` already composes `toolMetadataIssues + schemaIssues + traceIssues`. Add a fourth source.

**Files:**
- Modify: `src/lib/agentReadiness.ts`
- Test: `src/lib/agentReadiness.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/agentReadiness.test.ts`:

```ts
describe('agent run issues', () => {
  const tool = {
    name: 'search',
    description: 'Searches the index for matching records.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search text.' } },
      required: ['query'],
    },
  };
  const server = { id: 's1', name: 'One' };

  const summary = (over: Partial<import('./agent/types').AgentRunSummary>) => ({
    serverId: 's1',
    runs: 5,
    wrongToolPicks: 0,
    badArgDenials: 0,
    toolErrors: 0,
    unrecoveredErrors: 0,
    lastRunAt: 1,
    ...over,
  });

  it('adds no issue when no runs have happened', () => {
    const report = analyzeToolReadiness(tool, server, [], undefined);
    expect(report.issues.some((i) => i.id.startsWith('agent-'))).toBe(false);
  });

  it('adds no issue when runs were clean', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({}));
    expect(report.issues.some((i) => i.id.startsWith('agent-'))).toBe(false);
  });

  it('flags repeated wrong-tool picks as high severity', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({ wrongToolPicks: 2 }));
    const issue = report.issues.find((i) => i.id === 'agent-wrong-tool-picked');
    expect(issue?.severity).toBe('high');
    expect(issue?.message).toContain('2');
  });

  it('flags bad-argument denials', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({ badArgDenials: 3 }));
    expect(report.issues.some((i) => i.id === 'agent-bad-arguments')).toBe(true);
  });

  it('flags runs that ended without recovering', () => {
    const report = analyzeToolReadiness(tool, server, [], summary({ unrecoveredErrors: 2 }));
    expect(report.issues.some((i) => i.id === 'agent-unrecovered-run')).toBe(true);
  });

  it('lowers the score when agent issues are present', () => {
    const clean = analyzeToolReadiness(tool, server, [], summary({}));
    const messy = analyzeToolReadiness(tool, server, [], summary({ wrongToolPicks: 2 }));
    expect(messy.score).toBeLessThan(clean.score);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agentReadiness.test.ts`
Expected: FAIL — `analyzeToolReadiness` takes three arguments.

- [ ] **Step 3: Implement in `src/lib/agentReadiness.ts`**

Add the import:

```ts
import type { AgentRunSummaries, AgentRunSummary } from './agent/types';
```

Add the issue source above `analyzeToolReadiness`:

```ts
/**
 * Observed agent behaviour, as recorded by the chat's deny-reason prompts.
 * Nothing here is inferred from schemas — these are findings a human marked at
 * the moment they refused a call, which is why they carry more weight than the
 * static heuristics above.
 *
 * Only server-level counters exist today, so these attach to every tool on the
 * server rather than to the specific one that was mis-picked.
 */
function agentIssues(
  tool: ToolDef,
  context: Pick<AgentReadinessIssue, 'serverId' | 'serverName' | 'toolName'>,
  summary: AgentRunSummary | undefined,
): AgentReadinessIssue[] {
  if (!summary || summary.runs === 0) return [];
  const issues: AgentReadinessIssue[] = [];

  if (summary.wrongToolPicks > 0) {
    issues.push(issue(context, {
      id: 'agent-wrong-tool-picked',
      severity: summary.wrongToolPicks > 1 ? 'high' : 'medium',
      message: `A model picked the wrong tool ${summary.wrongToolPicks} time(s) across ${summary.runs} run(s) on this server.`,
      recommendation: 'Make each tool description state what it does and, explicitly, when not to use it.',
    }));
  }

  if (summary.badArgDenials > 0) {
    issues.push(issue(context, {
      id: 'agent-bad-arguments',
      severity: summary.badArgDenials > 1 ? 'high' : 'medium',
      message: `A model produced unusable arguments ${summary.badArgDenials} time(s) across ${summary.runs} run(s).`,
      recommendation: 'Constrain the schema: add enums, formats, examples, and per-field descriptions.',
    }));
  }

  if (summary.unrecoveredErrors > 0) {
    issues.push(issue(context, {
      id: 'agent-unrecovered-run',
      severity: 'medium',
      message: `${summary.unrecoveredErrors} of ${summary.runs} run(s) ended without recovering from an error or hit the turn limit.`,
      recommendation: 'Return errors that name the failing field and suggest a next step the agent can take.',
    }));
  }

  return issues;
}
```

Extend `analyzeToolReadiness` with a fourth parameter and compose the new source:

```ts
export function analyzeToolReadiness(
  tool: ToolDef,
  server: Pick<ServerEntry, 'id' | 'name'> = { id: 'server', name: 'Server' },
  traces: ProtocolTraceEvent[] = [],
  agentRun?: AgentRunSummary,
): AgentReadinessToolReport {
  const context = {
    serverId: server.id,
    serverName: server.name,
    toolName: tool.name,
  };
  const issues: AgentReadinessIssue[] = [
    ...toolMetadataIssues(tool, context),
    ...schemaIssues(tool, context),
    ...traceIssues(tool, context, traces),
    ...agentIssues(tool, context, agentRun),
  ].sort(compareIssues);
  const score = scoreFor(issues);

  return {
    serverId: server.id,
    serverName: server.name,
    toolName: tool.name,
    score,
    verdict: verdictFor(score, issues.filter((i) => i.severity === 'critical').length),
    issues,
  };
}
```

Extend `analyzeAgentReadiness` to pass the summary through:

```ts
export function analyzeAgentReadiness(
  servers: ServerEntry[],
  traces: ProtocolTraceEvent[] = [],
  agentRuns: AgentRunSummaries = {},
): AgentReadinessReport {
  const connectedServers = servers.filter((server) => server.status === 'connected');
  const tools = connectedServers.flatMap((server) =>
    getAllTools(server).map((tool) =>
      analyzeToolReadiness(tool, server, traces, agentRuns[server.id]),
    ),
  );
  // ...the rest of the function is unchanged.
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/agentReadiness.test.ts`
Expected: PASS, including the 6 new tests. Existing tests are unaffected because both new parameters default.

- [ ] **Step 5: Pass the summaries in at the call site**

Find where `AgentReadinessPanel` and `AgentReadinessBadge` call `analyzeAgentReadiness`:

Run: `grep -rn "analyzeAgentReadiness" src/components src/App.tsx`

At each call site, add `getAgentRunSummaries()` as the third argument, importing it from `../lib/agent/agentRunStore`.

- [ ] **Step 6: Run the suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agentReadiness.ts src/lib/agentReadiness.test.ts src/components/AgentReadinessPanel.tsx src/components/AgentReadinessBadge.tsx
git commit -m "feat(readiness): score observed agent behaviour alongside static heuristics"
```

---

# WAVE 3 — Presentational components and the replay seam

Four agents, fully parallel.

**Note on testing in this wave.** Vitest here runs `environment: 'node'` and includes only `src/**/*.test.ts` — not `.tsx`. There is no jsdom and no React testing library, and this plan does not add one. Components are therefore verified by `npm run build` (type checking) plus the Playwright specs in Wave 5. Task 14 is the exception: it is a `.ts` module and gets real unit tests.

### Task 14: Extract the replay-suite session store

`ReplaySuitesPanel.tsx` holds its suites in a module-level `let sessionSuites` that nothing can reach. The chat needs to add a captured run to that list, so the state moves to a module of its own.

**Files:**
- Create: `src/lib/replaySuiteSession.ts`
- Test: `src/lib/replaySuiteSession.test.ts`
- Modify: `src/components/ReplaySuitesPanel.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSessionSuite,
  getSessionSuites,
  resetSessionSuites,
  setSessionSuites,
  subscribeSessionSuites,
} from './replaySuiteSession';
import type { ReplaySuite } from './replaySuites';

const suite = (id: string): ReplaySuite => ({ id, name: id, createdAt: 1, cases: [] });

beforeEach(() => {
  resetSessionSuites();
});

describe('replaySuiteSession', () => {
  it('starts empty', () => {
    expect(getSessionSuites()).toEqual([]);
  });

  it('adds a suite to the front', () => {
    addSessionSuite(suite('a'));
    addSessionSuite(suite('b'));
    expect(getSessionSuites().map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('replaces the whole list', () => {
    addSessionSuite(suite('a'));
    setSessionSuites([suite('c')]);
    expect(getSessionSuites().map((s) => s.id)).toEqual(['c']);
  });

  it('notifies subscribers on change', () => {
    const listener = vi.fn();
    subscribeSessionSuites(listener);
    addSessionSuite(suite('a'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    subscribeSessionSuites(listener)();
    addSessionSuite(suite('a'));
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/replaySuiteSession.test.ts`
Expected: FAIL — cannot resolve `./replaySuiteSession`.

- [ ] **Step 3: Implement `src/lib/replaySuiteSession.ts`**

```ts
import type { ReplaySuite } from './replaySuites';

/**
 * Replay suites live for the session only, as they always have. This module
 * exists so more than one surface can reach them: the panel that authors them
 * and the agent chat, which captures a run as a suite. Same push/subscribe
 * shape as protocolTrace.ts.
 */
let suites: ReplaySuite[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getSessionSuites(): ReplaySuite[] {
  return suites;
}

export function setSessionSuites(next: ReplaySuite[]): void {
  suites = next;
  emit();
}

export function addSessionSuite(suite: ReplaySuite): void {
  suites = [suite, ...suites];
  emit();
}

export function subscribeSessionSuites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests only. */
export function resetSessionSuites(): void {
  suites = [];
  listeners.clear();
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/replaySuiteSession.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point `ReplaySuitesPanel.tsx` at the module**

Delete the module-level `let sessionSuites: ReplaySuite[] = [];` declaration. Replace the state initialiser and the sync effect:

```tsx
import {
  getSessionSuites,
  setSessionSuites,
  subscribeSessionSuites,
} from '../lib/replaySuiteSession';
```

```tsx
  const [suites, setSuites] = useState<ReplaySuite[]>(() => getSessionSuites());

  // Suites can also arrive from the agent chat, so re-read on every change
  // rather than treating this component as the only writer.
  useEffect(() => subscribeSessionSuites(() => setSuites(getSessionSuites())), []);
```

Replace the existing effect that wrote `sessionSuites = suites;` with a call that pushes local edits back into the module:

```tsx
  const commitSuites = useCallback((next: ReplaySuite[]) => {
    setSuites(next);
    setSessionSuites(next);
  }, []);
```

Then replace every `setSuites(...)` call that represents a user edit with `commitSuites(...)`. Leave the subscription's `setSuites` alone — it is reacting to the module, not writing to it.

- [ ] **Step 6: Verify the build and the replay Playwright spec still pass**

Run: `npm run build && npx playwright test tests/release/16-replay-suites.spec.ts`
Expected: build succeeds; the replay spec passes unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/replaySuiteSession.ts src/lib/replaySuiteSession.test.ts src/components/ReplaySuitesPanel.tsx
git commit -m "refactor(replay): move session suites into a shared module"
```

---

### Task 15: Tool call approval component

**Files:**
- Create: `src/components/ToolCallApproval.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import type { AgentToolCall, DenyReason, GateDecision, GateVerdict } from '../lib/agent/types';

interface Props {
  call: AgentToolCall;
  verdict: GateVerdict;
  serverName: string;
  onDecide: (decision: GateDecision) => void;
}

const DENY_REASONS: { value: DenyReason; label: string; hint: string }[] = [
  { value: 'wrong_tool', label: 'Wrong tool', hint: 'Descriptions do not tell these tools apart' },
  { value: 'bad_arguments', label: 'Bad arguments', hint: 'The schema did not constrain the model' },
  { value: 'unsafe', label: 'Unsafe', hint: 'Not recorded — already covered by Permission Surface' },
  { value: 'no_reason', label: 'Just no', hint: 'Not recorded' },
];

export function ToolCallApproval({ call, verdict, serverName, onDecide }: Props) {
  const [denying, setDenying] = useState(false);

  return (
    <div
      data-testid="tool-call-approval"
      className="border border-violet-800/60 bg-violet-950/20 rounded-lg p-3 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-violet-300">Tool call</span>
        <span className="font-mono text-xs text-zinc-200">{call.toolName}</span>
        <span className="text-[11px] text-zinc-500">{serverName}</span>
        {verdict === 'ask_locked' && (
          <span
            data-testid="risk-locked-badge"
            title="This tool can never be added to the session allowlist."
            className="ml-auto text-[10px] uppercase tracking-wide text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5"
          >
            Always asks
          </span>
        )}
      </div>

      <pre className="bg-zinc-900 border border-zinc-800 rounded-md p-2 text-[11px] text-zinc-300 overflow-x-auto">
        {JSON.stringify(call.args, null, 2)}
      </pre>

      {denying ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-zinc-400">Why are you denying this?</p>
          <div className="flex flex-wrap gap-1.5">
            {DENY_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                title={reason.hint}
                onClick={() => onDecide({ kind: 'deny', reason: reason.value })}
                className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-red-600 hover:text-red-300 transition-colors"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onDecide({ kind: 'allow', remember: false })}
            className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            Allow
          </button>
          {verdict !== 'ask_locked' && (
            <button
              type="button"
              onClick={() => onDecide({ kind: 'allow', remember: true })}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-violet-600 transition-colors"
            >
              Always allow this tool
            </button>
          )}
          <button
            type="button"
            onClick={() => setDenying(true)}
            className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:border-red-600 hover:text-red-300 transition-colors"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ToolCallApproval.tsx
git commit -m "feat(agent): tool call approval with deny reasons"
```

---

### Task 16: Transcript component

**Files:**
- Create: `src/components/AgentTranscript.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { AgentMessage, AgentToolCall } from '../lib/agent/types';

interface Props {
  messages: AgentMessage[];
  /** Text arriving from the model right now, not yet a finished message. */
  streamingText: string;
  onRecordObservation: (toolName: string, note: string) => void;
}

function ToolCallRow({
  call,
  onRecord,
}: {
  call: AgentToolCall;
  onRecord: (toolName: string, note: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-violet-400 font-mono">{call.toolName}</span>
      <span className="text-zinc-600 font-mono truncate">{JSON.stringify(call.args)}</span>
      <button
        type="button"
        onClick={() => onRecord(call.toolName, `Agent called ${call.toolName}`)}
        className="ml-auto shrink-0 text-zinc-600 hover:text-violet-400 transition-colors"
        title="Record this in the Observation Journal"
      >
        Record
      </button>
    </div>
  );
}

export function AgentTranscript({ messages, streamingText, onRecordObservation }: Props) {
  return (
    <div data-testid="agent-transcript" className="space-y-3">
      {messages.map((message, index) => {
        if (message.role === 'user') {
          return (
            <div key={index} className="text-sm text-zinc-200">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500 mr-2">You</span>
              {message.text}
            </div>
          );
        }

        if (message.role === 'tool') {
          return (
            <div
              key={index}
              data-testid="tool-result"
              className={[
                'border rounded-md p-2 text-[11px] font-mono whitespace-pre-wrap',
                message.isError
                  ? 'border-red-900/60 bg-red-950/20 text-red-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400',
              ].join(' ')}
            >
              {message.text}
            </div>
          );
        }

        return (
          <div key={index} className="space-y-1.5">
            {message.text && <div className="text-sm text-zinc-300">{message.text}</div>}
            {message.toolCalls?.map((call) => (
              <ToolCallRow key={call.id} call={call} onRecord={onRecordObservation} />
            ))}
          </div>
        );
      })}

      {streamingText && (
        <div data-testid="streaming-text" className="text-sm text-zinc-300">
          {streamingText}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentTranscript.tsx
git commit -m "feat(agent): transcript rendering"
```

---

### Task 17: Model picker component

**Files:**
- Create: `src/components/AgentModelPicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import type { ServerEntry } from '../types';
import type { LlmConfig, LlmProviderId } from '../lib/agent/types';

interface Props {
  configs: LlmConfig[];
  activeConfigId: string | null;
  servers: ServerEntry[];
  selectedServerIds: string[];
  onSelectConfig: (id: string) => void;
  onSaveConfig: (config: LlmConfig) => void;
  onDeleteConfig: (id: string) => void;
  onToggleServer: (serverId: string) => void;
}

const PROVIDERS: { id: LlmProviderId; label: string; baseUrl: string }[] = [
  { id: 'openai', label: 'OpenAI-compatible', baseUrl: 'http://127.0.0.1:11434/v1' },
];

function blankConfig(): LlmConfig {
  return {
    id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    provider: 'openai',
    baseUrl: PROVIDERS[0].baseUrl,
    model: '',
  };
}

export function AgentModelPicker({
  configs,
  activeConfigId,
  servers,
  selectedServerIds,
  onSelectConfig,
  onSaveConfig,
  onDeleteConfig,
  onToggleServer,
}: Props) {
  const [draft, setDraft] = useState<LlmConfig | null>(configs.length === 0 ? blankConfig() : null);
  const connected = servers.filter((server) => server.status === 'connected');

  if (draft) {
    return (
      <form
        data-testid="llm-config-form"
        className="space-y-2.5 max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveConfig(draft);
          setDraft(null);
        }}
      >
        <p className="text-[11px] text-zinc-500">
          Credentials are stored in the encrypted vault, alongside your servers.
        </p>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Name</span>
          <input
            required
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Local Qwen"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Base URL</span>
          <input
            required
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value.replace(/\/+$/, '') })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Model</span>
          <input
            required
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder="qwen3"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">
            API key (leave empty for local models)
          </span>
          <input
            type="password"
            value={draft.apiKey ?? ''}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value || undefined })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </label>

        <div className="flex gap-1.5">
          <button
            type="submit"
            className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            Save model
          </button>
          {configs.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        data-testid="llm-config-select"
        value={activeConfigId ?? ''}
        onChange={(e) => onSelectConfig(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
      >
        {configs.map((config) => (
          <option key={config.id} value={config.id}>
            {config.label} · {config.model}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setDraft(blankConfig())}
        className="text-xs text-zinc-500 hover:text-violet-400 transition-colors"
      >
        Add model
      </button>
      {activeConfigId && (
        <button
          type="button"
          onClick={() => onDeleteConfig(activeConfigId)}
          className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      )}

      <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-600">Servers</span>
      {connected.map((server) => (
        <label key={server.id} className="flex items-center gap-1 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            checked={selectedServerIds.includes(server.id)}
            onChange={() => onToggleServer(server.id)}
          />
          {server.name}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentModelPicker.tsx
git commit -m "feat(agent): model configuration and server scope picker"
```

---

# WAVE 4 — Integration

**One agent, serial.** These three tasks compose each other and share a prop surface; splitting them across agents would mean merging conflicting guesses about that surface.

### Task 18: The run hook

**Files:**
- Create: `src/components/useAgentRun.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ServerEntry } from '../types';
import { getHost } from '../lib/host';
import { callTool } from '../lib/mcpClient';
import { getProtocolTraces } from '../lib/protocolTrace';
import { auditPermissionSurface, type ToolPermissionProfile } from '../lib/permissionSurfaceAudit';
import { buildReplayCaseFromTrace, type ReplayCase } from '../lib/replaySuites';
import { addSessionSuite } from '../lib/replaySuiteSession';
import { gateVerdict, rememberAllowed } from '../lib/agent/gating';
import { DENIAL_TEXT, runAgentTurn } from '../lib/agent/loop';
import { recordAgentRun } from '../lib/agent/agentRunStore';
import { buildToolCatalog } from '../lib/agent/toolCatalog';
import {
  DEFAULT_MAX_TURNS,
  type AgentEvent,
  type AgentMessage,
  type AgentToolCall,
  type GateDecision,
  type GateVerdict,
  type LlmConfig,
} from '../lib/agent/types';

const SYSTEM_PROMPT = [
  'You are connected to one or more MCP servers through Sleuth, a tool for investigating them.',
  'Use the provided tools to answer the user. Prefer a tool over guessing.',
  'The user reviews and may refuse any tool call. If a call is refused, read the reason and adapt',
  'rather than retrying the same call unchanged.',
].join(' ');

export interface PendingCall {
  call: AgentToolCall;
  verdict: GateVerdict;
  serverName: string;
}

function profileKey(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

export function useAgentRun(
  servers: ServerEntry[],
  config: LlmConfig | null,
  selectedServerIds: string[],
  maxTurns: number = DEFAULT_MAX_TURNS,
) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [pending, setPending] = useState<PendingCall | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<AgentMessage[]>([]);
  const decideRef = useRef<((decision: GateDecision) => void) | null>(null);
  const allowedRef = useRef<ReadonlySet<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const preRunTraceIds = useRef<Set<string>>(new Set());

  const catalog = useMemo(
    () => buildToolCatalog(servers, selectedServerIds),
    [servers, selectedServerIds],
  );

  const profiles = useMemo(() => {
    const map = new Map<string, ToolPermissionProfile>();
    for (const surface of auditPermissionSurface(servers).servers) {
      for (const profile of surface.tools) {
        map.set(profileKey(surface.serverId, profile.toolName), profile);
      }
    }
    return map;
  }, [servers]);

  const serverName = useCallback(
    (serverId: string) => servers.find((s) => s.id === serverId)?.name ?? serverId,
    [servers],
  );

  const commit = useCallback((next: AgentMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const decide = useCallback((decision: GateDecision) => {
    const resolve = decideRef.current;
    decideRef.current = null;
    setPending(null);
    resolve?.(decision);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // A pending gate would otherwise hold the loop open forever.
    if (decideRef.current) decide({ kind: 'deny', reason: 'no_reason' });
  }, [decide]);

  const reset = useCallback(() => {
    stop();
    commit([]);
    setStreamingText('');
    setError(null);
    allowedRef.current = new Set();
  }, [commit, stop]);

  const send = useCallback(
    async (text: string) => {
      if (!config || running || selectedServerIds.length === 0) return;

      setError(null);
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;
      preRunTraceIds.current = new Set(getProtocolTraces().map((trace) => trace.id));

      const history: AgentMessage[] = [...messagesRef.current, { role: 'user', text }];
      commit(history);

      const events: AgentEvent[] = [];
      let streamed = '';
      let live = history;

      const append = (message: AgentMessage) => {
        live = [...live, message];
        commit(live);
      };

      try {
        const generator = runAgentTurn(
          {
            sendToModel: (req, signal) => getHost().llm.chat(req, signal),
            callTool,
            gate: (call) => {
              const verdict = gateVerdict(
                call,
                profiles.get(profileKey(call.serverId, call.toolName)),
                allowedRef.current,
              );
              if (verdict === 'auto') {
                return Promise.resolve<GateDecision>({ kind: 'allow', remember: false });
              }
              return new Promise<GateDecision>((resolve) => {
                decideRef.current = (decision) => {
                  if (decision.kind === 'allow' && decision.remember) {
                    allowedRef.current = rememberAllowed(allowedRef.current, call);
                  }
                  resolve(decision);
                };
                setPending({ call, verdict, serverName: serverName(call.serverId) });
              });
            },
            resolve: catalog.resolve,
            maxTurns,
            signal: controller.signal,
          },
          { config, system: SYSTEM_PROMPT, tools: catalog.tools, messages: history },
        );

        for (;;) {
          const next = await generator.next();
          if (next.done) {
            commit(next.value);
            break;
          }
          const event = next.value;
          events.push(event);

          if (event.type === 'model_delta') {
            streamed += event.text;
            setStreamingText(streamed);
          } else if (event.type === 'model_message') {
            streamed = '';
            setStreamingText('');
            append(event.message);
          } else if (event.type === 'tool_result') {
            append({
              role: 'tool',
              text: event.text,
              toolCallId: event.call.id,
              isError: event.isError,
            });
          } else if (event.type === 'tool_denied') {
            append({
              role: 'tool',
              text: DENIAL_TEXT[event.reason],
              toolCallId: event.call.id,
              isError: true,
            });
          } else if (event.type === 'error') {
            setError(event.message);
          } else if (event.type === 'turn_limit') {
            setError(`Stopped after ${event.turns} turns.`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStreamingText('');
        setRunning(false);
        abortRef.current = null;
        decideRef.current = null;
        setPending(null);
        // Only derived counters are stored; the transcript is never persisted.
        if (selectedServerIds[0]) recordAgentRun(selectedServerIds[0], events);
      }
    },
    [catalog, commit, config, maxTurns, profiles, running, selectedServerIds, serverName],
  );

  /**
   * Turn this run's tool calls into a replay suite. The calls are already
   * protocol traces, so the existing trace-to-case converter does the work.
   * Traces are matched by id rather than by time, so ordering in the store
   * does not matter.
   */
  const captureAsSuite = useCallback(
    (name: string): number => {
      const cases = getProtocolTraces()
        .filter((trace) => !preRunTraceIds.current.has(trace.id))
        .map((trace) => buildReplayCaseFromTrace(trace, serverName(trace.serverId)))
        .filter((entry): entry is ReplayCase => entry !== null);
      if (cases.length === 0) return 0;
      addSessionSuite({
        id: `suite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        createdAt: Date.now(),
        cases,
      });
      return cases.length;
    },
    [serverName],
  );

  return {
    messages,
    streamingText,
    pending,
    running,
    error,
    collisions: catalog.collisions,
    toolCount: catalog.tools.length,
    send,
    decide,
    stop,
    reset,
    captureAsSuite,
  };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/useAgentRun.ts
git commit -m "feat(agent): React hook driving the agent loop"
```

---

### Task 19: The chat panel

**Files:**
- Create: `src/components/AgentChatPanel.tsx`

- [ ] **Step 1: Write the panel**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { ServerEntry } from '../types';
import { addInvocationObservation } from '../lib/observationJournal';
import { updateObservationJournal } from '../lib/observationJournalStore';
import type { LlmConfig } from '../lib/agent/types';
import { useProtocolTraces } from './useProtocolTraces';
import { AgentModelPicker } from './AgentModelPicker';
import { AgentTranscript } from './AgentTranscript';
import { ToolCallApproval } from './ToolCallApproval';
import { useAgentRun } from './useAgentRun';

interface Props {
  servers: ServerEntry[];
  llmConfigs: LlmConfig[];
  onSaveLlmConfigs: (configs: LlmConfig[]) => void;
  /** The server the user is currently investigating; the default chat scope. */
  activeServerId: string | null;
  onClose: () => void;
}

export function AgentChatPanel({
  servers,
  llmConfigs,
  onSaveLlmConfigs,
  activeServerId,
  onClose,
}: Props) {
  const [activeConfigId, setActiveConfigId] = useState<string | null>(
    llmConfigs[0]?.id ?? null,
  );
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>(
    activeServerId ? [activeServerId] : [],
  );
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const traces = useProtocolTraces();
  const config = llmConfigs.find((c) => c.id === activeConfigId) ?? null;
  const run = useAgentRun(servers, config, selectedServerIds);

  useEffect(() => {
    if (!activeConfigId && llmConfigs.length > 0) setActiveConfigId(llmConfigs[0].id);
  }, [activeConfigId, llmConfigs]);

  const recordObservation = useCallback(
    (toolName: string, note: string) => {
      const serverId = selectedServerIds[0];
      const server = servers.find((s) => s.id === serverId);
      if (!server) return;
      updateObservationJournal(server, (journal) =>
        addInvocationObservation(journal, { toolName, note, flagged: false }),
      );
      setNotice('Recorded in the Observation Journal.');
    },
    [selectedServerIds, servers],
  );

  const capture = useCallback(() => {
    const count = run.captureAsSuite(`Agent run ${new Date().toLocaleTimeString()}`);
    setNotice(
      count > 0
        ? `Captured ${count} call(s) as a replay suite.`
        : 'No successful tool calls in this run to capture.',
    );
  }, [run]);

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput('');
      setNotice(null);
      void run.send(text);
    },
    [input, run],
  );

  const runTraces = traces.filter((trace) => trace.method === 'tools/call').slice(0, 40);

  return (
    <div
      data-testid="agent-chat-panel"
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col"
    >
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Back to servers
        </button>
        <span className="text-sm font-medium text-zinc-200">Agent Chat</span>
        <div className="ml-auto">
          <AgentModelPicker
            configs={llmConfigs}
            activeConfigId={activeConfigId}
            servers={servers}
            selectedServerIds={selectedServerIds}
            onSelectConfig={setActiveConfigId}
            onSaveConfig={(next) => {
              const rest = llmConfigs.filter((c) => c.id !== next.id);
              onSaveLlmConfigs([...rest, next]);
              setActiveConfigId(next.id);
            }}
            onDeleteConfig={(id) => {
              onSaveLlmConfigs(llmConfigs.filter((c) => c.id !== id));
              setActiveConfigId(null);
            }}
            onToggleServer={(serverId) =>
              setSelectedServerIds((current) =>
                current.includes(serverId)
                  ? current.filter((id) => id !== serverId)
                  : [...current, serverId],
              )
            }
          />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <section className="flex-1 flex flex-col min-w-0 border-r border-zinc-800">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {run.collisions.map((collision) => (
              <p
                key={`${collision.llmName}-${collision.droppedServerId}`}
                data-testid="tool-collision-warning"
                className="text-[11px] text-amber-400"
              >
                Two selected servers export a tool named{' '}
                <span className="font-mono">{collision.llmName}</span>. Only{' '}
                {run.toolCount > 0 ? 'the first' : 'one'} is exposed —{' '}
                {collision.droppedServerName}&rsquo;s copy is hidden from the model.
              </p>
            ))}

            <AgentTranscript
              messages={run.messages}
              streamingText={run.streamingText}
              onRecordObservation={recordObservation}
            />

            {run.pending && (
              <ToolCallApproval
                call={run.pending.call}
                verdict={run.pending.verdict}
                serverName={run.pending.serverName}
                onDecide={run.decide}
              />
            )}

            {run.error && (
              <p data-testid="agent-error" className="text-xs text-red-400">
                {run.error}
              </p>
            )}
            {notice && <p className="text-[11px] text-violet-300">{notice}</p>}
          </div>

          <form onSubmit={submit} className="border-t border-zinc-800 p-3 flex gap-2">
            <input
              data-testid="agent-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!config || selectedServerIds.length === 0}
              placeholder={
                !config
                  ? 'Add a model to start'
                  : selectedServerIds.length === 0
                    ? 'Select a connected server'
                    : 'Ask something…'
              }
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />
            {run.running ? (
              <button
                type="button"
                onClick={run.stop}
                className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                data-testid="agent-send"
                disabled={!config || selectedServerIds.length === 0}
                className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            )}
          </form>
        </section>

        <aside className="w-80 shrink-0 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Live trace</span>
            <button
              type="button"
              data-testid="capture-replay-suite"
              onClick={capture}
              className="ml-auto text-[11px] text-zinc-500 hover:text-violet-400 transition-colors"
            >
              Capture as suite
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {runTraces.length === 0 ? (
              <p className="text-[11px] text-zinc-600">No tool calls yet.</p>
            ) : (
              runTraces.map((trace) => (
                <div key={trace.id} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={
                      trace.status === 'error'
                        ? 'text-red-400'
                        : trace.status === 'ok'
                          ? 'text-green-400'
                          : 'text-zinc-500'
                    }
                  >
                    ●
                  </span>
                  <span className="font-mono text-zinc-400 truncate">{trace.method}</span>
                  {typeof trace.durationMs === 'number' && (
                    <span className="ml-auto text-zinc-600">{trace.durationMs}ms</span>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: succeeds. If `useProtocolTraces` returns a different shape than an array of trace events, adapt the `traces.filter(...)` line to match its actual return value — check with `sed -n '1,30p' src/components/useProtocolTraces.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentChatPanel.tsx
git commit -m "feat(agent): chat overlay with live trace and payoff actions"
```

---

### Task 20: Wire the overlay into the app

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the lazy import**

Beside the existing `ScenarioRunnerPanel` lazy import:

```tsx
const AgentChatPanel = lazy(() =>
  import('./components/AgentChatPanel').then((m) => ({ default: m.AgentChatPanel })),
);
```

- [ ] **Step 2: Add the open flag**

Beside `const [scenarioRunnerOpen, setScenarioRunnerOpen] = useState(false);`:

```tsx
  const [agentChatOpen, setAgentChatOpen] = useState(false);
```

- [ ] **Step 3: Add the toolbar button**

Beside the Scenarios button (around `src/App.tsx:599`), copying its classes exactly:

```tsx
          <button
            onClick={() => setAgentChatOpen(true)}
            title="Agent Chat"
            className={/* same className expression as the Scenarios button */}
          >
            <span>Chat</span>
          </button>
```

- [ ] **Step 4: Render the overlay**

Beside the `{scenarioRunnerOpen && (...)}` block (around `src/App.tsx:730`), inside the same `<Suspense>` pattern that block uses:

```tsx
      {agentChatOpen && (
        <Suspense fallback={null}>
          <AgentChatPanel
            servers={servers}
            llmConfigs={llmConfigs}
            onSaveLlmConfigs={saveLlmConfigs}
            activeServerId={selectedServerId}
            onClose={() => setAgentChatOpen(false)}
          />
        </Suspense>
      )}
```

`llmConfigs` and `saveLlmConfigs` come from the `useVault` hook (Task 2). Destructure them where the hook's other values are destructured. `selectedServerId` is the existing selected-server state — use whatever name `App.tsx` already gives it.

- [ ] **Step 5: Confirm the locked-vault case needs no branch**

The spec requires the chat to be unavailable while the vault is locked. Check that the toolbar and the overlay both render inside the branch that already gates on the unlocked vault — the same one that hides the server list behind `VaultUnlock`/`VaultSetup`.

Run: `grep -n "VaultUnlock\|VaultSetup\|phase ===" src/App.tsx | head`

Expected: the toolbar button added in Step 3 sits inside the unlocked branch. If it does not, move it — do **not** add an `isLocked` check to the panel. Provider credentials live in the vault, so a locked vault means there is no model to talk to, and one gate is better than two.

- [ ] **Step 6: Verify the build, the suite, and the app**

Run: `npm run build && npm test && npm run lint`
Expected: all PASS.

- [ ] **Step 7: Verify by hand against the fixture**

Run, in three terminals:

```bash
node tests/fixtures/http-mcp-server.mjs 3001
node tests/fixtures/llm-server.mjs 3003
npm run dev
```

Then: add the fixture MCP server, connect it, open Chat, add a model with base URL `http://127.0.0.1:3003/v1` and model `fixture-model`, and send "say hello".

Expected: the model requests `echo`, an approval card appears, Allow runs it, the tool result renders, and the model answers. The right-hand trace column shows the `tools/call`.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(agent): open the agent chat from the toolbar"
```

---

# WAVE 5 — End-to-end coverage and docs

Three agents, fully parallel.

### Task 21: Browser release spec

**Files:**
- Create: `tests/release/26-agent-chat.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Start the LLM fixture from the Playwright config**

`playwright.config.ts` already starts `server.js` and the MCP fixture. Add a third entry to its `webServer` array:

```ts
    {
      command: 'node tests/fixtures/llm-server.mjs 3003',
      url: 'http://127.0.0.1:3003/v1/models',
      reuseExistingServer: !process.env.CI,
    },
```

Match the exact option names the existing entries use.

- [ ] **Step 2: Write the spec**

```ts
import { expect, test } from '@playwright/test';
import { addFixtureServer, openApp } from './helpers';

// §3.26 — Agent Chat
//
// Runs against tests/fixtures/llm-server.mjs, a scripted OpenAI-compatible
// model. Turn 1 always requests the `echo` tool; turn 2 always answers. A real
// model would make these assertions non-deterministic.

const FIXTURE_MODEL_BASE = 'http://127.0.0.1:3003/v1';

async function openChatWithModel(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Agent Chat' }).click();
  await expect(page.getByTestId('agent-chat-panel')).toBeVisible();

  const form = page.getByTestId('llm-config-form');
  if (await form.isVisible()) {
    await form.getByPlaceholder('Local Qwen').fill('Fixture');
    await page.getByRole('textbox', { name: /base url/i }).fill(FIXTURE_MODEL_BASE);
    await form.getByPlaceholder('qwen3').fill('fixture-model');
    await form.getByRole('button', { name: 'Save model' }).click();
  }
  await expect(page.getByTestId('llm-config-select')).toBeVisible();
}

test.describe('§3.26 Agent Chat', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await addFixtureServer(page);
  });

  test('the model requests a tool and the call is gated', async ({ page }) => {
    await openChatWithModel(page);
    await page.getByTestId('agent-input').fill('say hello');
    await page.getByTestId('agent-send').click();

    const approval = page.getByTestId('tool-call-approval');
    await expect(approval).toBeVisible();
    await expect(approval).toContainText('echo');
    await expect(approval).toContainText('hello from the agent');
  });

  test('allowing a call runs it and the model answers', async ({ page }) => {
    await openChatWithModel(page);
    await page.getByTestId('agent-input').fill('say hello');
    await page.getByTestId('agent-send').click();
    await page.getByTestId('tool-call-approval').getByRole('button', { name: 'Allow' }).click();

    await expect(page.getByTestId('tool-result')).toBeVisible();
    await expect(page.getByTestId('agent-transcript')).toContainText('We are done');
  });

  test('denying a call asks for a reason and the run continues', async ({ page }) => {
    await openChatWithModel(page);
    await page.getByTestId('agent-input').fill('say hello');
    await page.getByTestId('agent-send').click();

    const approval = page.getByTestId('tool-call-approval');
    await approval.getByRole('button', { name: 'Deny' }).click();
    await expect(approval.getByRole('button', { name: 'Wrong tool' })).toBeVisible();
    await approval.getByRole('button', { name: 'Wrong tool' }).click();

    // The denial is fed back to the model rather than aborting the run.
    await expect(page.getByTestId('agent-transcript')).toContainText('denied');
    await expect(page.getByTestId('agent-transcript')).toContainText('We are done');
  });

  test('a completed run can be captured as a replay suite', async ({ page }) => {
    await openChatWithModel(page);
    await page.getByTestId('agent-input').fill('say hello');
    await page.getByTestId('agent-send').click();
    await page.getByTestId('tool-call-approval').getByRole('button', { name: 'Allow' }).click();
    await expect(page.getByTestId('tool-result')).toBeVisible();

    await page.getByTestId('capture-replay-suite').click();
    await expect(page.getByTestId('agent-chat-panel')).toContainText('Captured 1 call');
  });

  test('a tool call made from the chat appears in the live trace', async ({ page }) => {
    await openChatWithModel(page);
    await page.getByTestId('agent-input').fill('say hello');
    await page.getByTestId('agent-send').click();
    await page.getByTestId('tool-call-approval').getByRole('button', { name: 'Allow' }).click();

    await expect(page.getByTestId('agent-chat-panel')).toContainText('tools/call');
  });

  test('sending is disabled until a model exists', async ({ page }) => {
    await page.getByRole('button', { name: 'Agent Chat' }).click();
    await expect(page.getByTestId('llm-config-form')).toBeVisible();
    await expect(page.getByTestId('agent-input')).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npx playwright test tests/release/26-agent-chat.spec.ts`
Expected: 6 tests PASS. If a selector misses, read the failure's DOM snapshot and align the locator with the component's actual markup — do not weaken an assertion to make it pass.

- [ ] **Step 4: Run the whole browser suite**

Run: `npx playwright test tests/release/`
Expected: all previous specs still pass, plus the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add tests/release/26-agent-chat.spec.ts playwright.config.ts
git commit -m "test(release): §3.26 agent chat coverage"
```

---

### Task 22: Electron spec

**Files:**
- Create: `tests/electron/08-agent-chat.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

// Agent Chat in the desktop build. The point of difference from the browser
// suite: provider traffic leaves the main process, so no request may touch
// /__llm_proxy — that endpoint does not exist in the packaged app.

test.describe('Agent Chat (desktop)', () => {
  test('provider traffic does not go through the browser proxy', async () => {
    const { app, page, close } = await launchApp();
    try {
      const proxyRequests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/__llm_proxy')) proxyRequests.push(request.url());
      });

      await page.getByRole('button', { name: 'Agent Chat' }).click();
      await expect(page.getByTestId('agent-chat-panel')).toBeVisible();

      const form = page.getByTestId('llm-config-form');
      await form.getByPlaceholder('Local Qwen').fill('Fixture');
      await page.getByRole('textbox', { name: /base url/i }).fill('http://127.0.0.1:3003/v1');
      await form.getByPlaceholder('qwen3').fill('fixture-model');
      await form.getByRole('button', { name: 'Save model' }).click();

      await expect(page.getByTestId('llm-config-select')).toBeVisible();
      expect(proxyRequests).toEqual([]);
      expect(app).toBeTruthy();
    } finally {
      await close();
    }
  });

  test('the chat overlay opens and closes', async () => {
    const { page, close } = await launchApp();
    try {
      await page.getByRole('button', { name: 'Agent Chat' }).click();
      await expect(page.getByTestId('agent-chat-panel')).toBeVisible();
      await page.getByRole('button', { name: 'Back to servers' }).click();
      await expect(page.getByTestId('agent-chat-panel')).toBeHidden();
    } finally {
      await close();
    }
  });
});
```

Adapt `launchApp` and the import path to whatever the existing Electron specs use — check with `sed -n '1,25p' tests/electron/01-launch.spec.ts`.

- [ ] **Step 2: Start the LLM fixture for this suite**

Add the same `webServer` entry from Task 21 to `playwright.electron.config.ts`, matching that file's existing option names.

- [ ] **Step 3: Run the spec**

Run: `xvfb-run -a npx playwright test --config playwright.electron.config.ts tests/electron/08-agent-chat.spec.ts`
Expected: 2 tests PASS. Drop `xvfb-run -a` if you have a display.

- [ ] **Step 4: Run the whole Electron suite**

Run: `npm run package:dir && xvfb-run -a npm run test:e2e:electron`
Expected: all previous specs still pass, plus the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add tests/electron/08-agent-chat.spec.ts playwright.electron.config.ts
git commit -m "test(electron): agent chat egress from the main process"
```

---

### Task 23: Release skill and READMEs

This is the release gate in `CLAUDE.md`, not optional documentation.

**Files:**
- Modify: `.cursor/skills/prepare-for-release/SKILL.md`
- Modify: `README.md`
- Modify: `README.npm.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add §3.26 to the release skill**

Add a section following the format of the existing §3.N entries:

```markdown
### §3.26 Agent Chat

Covered by `tests/release/26-agent-chat.spec.ts` (6 tests) and
`tests/electron/08-agent-chat.spec.ts` (2 tests).

**Manual pass.** Connect a server. Open Chat, add a model (a local Ollama
endpoint needs no key), and ask for something the server can do.

Observe:
- The model requests a tool and the run **pauses** on an approval card showing
  the exact arguments.
- "Always allow this tool" suppresses later prompts for that tool — except on a
  tool the Permission Surface tab marks destructive, shell, credential, or
  admin, which shows "Always asks" and re-prompts every time.
- Denying offers a reason; after denying, the model **keeps going** rather than
  the run aborting.
- The right-hand trace column lists each `tools/call`, and the same calls appear
  in the Protocol Inspector.
- "Capture as suite" adds the run to Replay Suites.

**Blocks release if:** a tool call executes without an approval prompt; a
risk-locked tool can be added to the allowlist; provider requests reach
`/__llm_proxy` in the desktop build; or an API key appears anywhere in the
Protocol Inspector.
```

- [ ] **Step 2: Update the test counts in the release skill**

Update the browser suite from "25 spec files, 105 tests" to "26 spec files, 111 tests" and the Electron suite from "7 spec files, 44 tests" to "8 spec files, 46 tests".

Verify the real numbers first:

```bash
npx playwright test tests/release/ --list | tail -3
xvfb-run -a npx playwright test --config playwright.electron.config.ts --list | tail -3
```

Use the numbers those commands print, not the ones above, if they differ.

- [ ] **Step 3: Update `CLAUDE.md`**

Three edits, all factual:

- Add `26-agent-chat.spec.ts` / "Agent Chat" to the browser spec table, and `08-agent-chat.spec.ts` / "Agent chat, provider egress from main" to the Electron table. Update both counts in the surrounding prose.
- Add the new `src/lib/agent/` tree, `src/lib/replaySuiteSession.ts`, and the new components to the architecture tree.
- In the Server-Side Boundaries table, add:

  | `llm-proxy.js` | Forwards provider requests for the browser build so local models and Anthropic work without CORS configuration. Constrained to each provider's known endpoint paths — not a general relay. The desktop app does not use it. |

- In the Persistence Model table, add a row: LLM provider configs → encrypted vault, beside servers; and a row: agent run summaries → `appData` → `data.gz`. State plainly that transcripts are never persisted.
- Update the Vitest count in the TDD section from 518 to the number `npm test` actually reports.

- [ ] **Step 4: Update `README.md`**

Add an "Agent Chat" section covering: what it is (drive a real model against a server and watch what it does), that it works with local models via Ollama/LM Studio and with cloud providers, that keys live in the encrypted vault, and that every tool call is approval-gated with risky tools always re-prompting.

- [ ] **Step 5: Update `README.npm.md`**

Add the same feature to the CLI feature list, with a note that the CLI build proxies provider traffic through the local server so local models work without setting `OLLAMA_ORIGINS`.

- [ ] **Step 6: Verify the counts are honest**

Run: `npm test 2>&1 | tail -5`
Expected: the total matches the number written into `CLAUDE.md`.

- [ ] **Step 7: Commit**

```bash
git add .cursor/skills/prepare-for-release/SKILL.md README.md README.npm.md CLAUDE.md
git commit -m "docs: agent chat in the release checklist and both READMEs"
```

---

# PHASE 2 — Anthropic and Gemini adapters

Two agents, parallel. Ships after Phase 1 is merged and proven. Each is one adapter file, one test file, and one line in the registry.

### Task 24: Anthropic adapter

**Files:**
- Create: `src/lib/agent/providers/anthropic.ts`
- Test: `src/lib/agent/providers/anthropic.test.ts`
- Modify: `src/lib/agent/providers/index.ts`
- Modify: `src/components/AgentModelPicker.tsx`

- [ ] **Step 1: Write the failing test**

Mirror `openai.test.ts` structure exactly, asserting Anthropic's shape instead:

- `buildRequest` targets `${baseUrl}/messages`.
- Headers are `x-api-key` (not `Authorization`), `anthropic-version: 2023-06-01`, and `content-type: application/json`.
- The system prompt is a **top-level `system` field**, not a message.
- Tools are `{ name, description, input_schema }` — `input_schema`, not `parameters`.
- An assistant turn with tool calls serializes to a `content` array of
  `{ type: 'tool_use', id, name, input }` blocks.
- A tool result serializes to a **user** message whose content is
  `[{ type: 'tool_result', tool_use_id, content }]`.
- Stream parsing handles `content_block_delta` with `text_delta` for prose and
  `input_json_delta` for tool arguments, keyed by the block `index`, and emits
  the final response on `message_stop`.
- `modelsRequest` targets `${baseUrl}/models` with the same headers, and
  `parseModels` reads `data[].id`.

Write each of those as its own `it(...)` with a concrete literal expectation, as `openai.test.ts` does.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/providers/anthropic.test.ts`
Expected: FAIL — cannot resolve `./anthropic`.

- [ ] **Step 3: Implement the adapter**

Implement `anthropicProvider` against the `LlmProvider` interface from `./types`. Do not change that interface — if something does not fit, stop and report.

- [ ] **Step 4: Register and expose it**

In `providers/index.ts`:

```ts
import { anthropicProvider } from './anthropic';
registerProvider(anthropicProvider);
```

In `AgentModelPicker.tsx`, add to `PROVIDERS`:

```ts
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
```

and add a provider `<select>` to the config form bound to `draft.provider`, defaulting `baseUrl` from the chosen entry.

- [ ] **Step 5: Verify against a real endpoint**

Run the app, add an Anthropic model with a real key, and run one tool-using turn.
Expected: the tool call is gated, executes, and the model answers. The `llm-proxy.js` allowlist already permits `/messages`, so no server change is needed.

- [ ] **Step 6: Run everything and commit**

```bash
npm test && npm run build && npm run lint
git add src/lib/agent/providers/anthropic.ts src/lib/agent/providers/anthropic.test.ts src/lib/agent/providers/index.ts src/components/AgentModelPicker.tsx
git commit -m "feat(agent): Anthropic provider adapter"
```

---

### Task 25: Gemini adapter

**Files:**
- Create: `src/lib/agent/providers/gemini.ts`
- Test: `src/lib/agent/providers/gemini.test.ts`
- Modify: `src/lib/agent/providers/index.ts`
- Modify: `src/components/AgentModelPicker.tsx`

- [ ] **Step 1: Write the failing test**

Mirror `openai.test.ts` structure, asserting Gemini's shape:

- `buildRequest` targets
  `${baseUrl}/models/${model}:streamGenerateContent?alt=sse`.
- The key travels as an `x-goog-api-key` header.
- The system prompt is `systemInstruction: { parts: [{ text }] }`.
- History is `contents: [{ role: 'user' | 'model', parts: [...] }]`.
- An assistant tool call is a part `{ functionCall: { name, args } }`.
- A tool result is a **user** part
  `{ functionResponse: { name, response: { content } } }` — note it is keyed by
  tool **name**, not by call id, so the adapter must look the name up from the
  matching assistant turn.
- Tools are `[{ functionDeclarations: [{ name, description, parameters }] }]`.
- Stream parsing reads SSE `data:` lines and pulls
  `candidates[0].content.parts[]`, accumulating `text` parts and collecting
  `functionCall` parts.
- Since Gemini assigns no call id, the adapter synthesises one
  (`gemini-${index}`) so `AgentToolCall.id` stays unique within a turn.
- `modelsRequest` targets `${baseUrl}/models`, and `parseModels` reads
  `models[].name`, stripping the `models/` prefix.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/lib/agent/providers/gemini.test.ts`
Expected: FAIL — cannot resolve `./gemini`.

- [ ] **Step 3: Implement the adapter**

Implement `geminiProvider` against the same `LlmProvider` interface.

- [ ] **Step 4: Register and expose it**

In `providers/index.ts`:

```ts
import { geminiProvider } from './gemini';
registerProvider(geminiProvider);
```

In `AgentModelPicker.tsx`, add to `PROVIDERS`:

```ts
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
```

- [ ] **Step 5: Verify against a real endpoint**

Run the app, add a Gemini model with a real key, run one tool-using turn.
Expected: the tool call is gated, executes, and the model answers. The proxy allowlist already permits `:streamGenerateContent`.

- [ ] **Step 6: Run everything and commit**

```bash
npm test && npm run build && npm run lint
git add src/lib/agent/providers/gemini.ts src/lib/agent/providers/gemini.test.ts src/lib/agent/providers/index.ts src/components/AgentModelPicker.tsx
git commit -m "feat(agent): Gemini provider adapter"
```

---

## Final verification before merging to main

Run the whole gate, in this order:

```bash
npm run lint
npm test
npm run build
npx playwright test tests/release/
npm run package:dir
node scripts/check-packaged-imports.mjs
xvfb-run -a npm run test:e2e:electron
```

Every one must pass. `check-packaged-imports.mjs` matters here specifically: if `electron/main.js` gained a root-module import during Task 11, the app packages cleanly and dies on launch.

Then confirm by hand, in the desktop build, that no API key appears anywhere in the Protocol Inspector. `protocolTrace.ts` redacts by key name, and provider traffic never enters it at all — but this is the one failure the automated suite cannot prove absent.
