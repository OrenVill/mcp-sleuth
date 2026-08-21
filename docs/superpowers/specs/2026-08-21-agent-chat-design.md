# Agent Chat — Design

**Date:** 2026-08-21
**Status:** Approved, not yet planned

## Summary

Add an in-app chat that drives a user-supplied LLM — local or cloud — against a connected
MCP server, with every tool call approval-gated and traced. The chat is a **test-bench for
the server**, not a general-purpose MCP client: its output is evidence about how a real
model behaves against this server's tools, feeding the Observation Journal, Replay Suites,
and Agent Readiness.

## Why

Every trust surface Sleuth ships today — Permission Surface, Prompt Injection, Agent
Readiness — infers risk from schemas and descriptions. None of them observe an agent. A
chat closes that loop: Agent Readiness stops being a heuristic and gains real evidence, and
the Observation Journal gets the automated source of findings it currently lacks.

Two existing facts make this cheaper than it looks:

- `analyzeAgentReadiness(servers, traces)` already accepts protocol traces and composes a
  `traceIssues()` source. Chat tool calls run through `mcpClient.ts`, so they land in
  `protocolTrace.ts` automatically. Protocol-level readiness signal costs nothing.
- `buildReplayCaseFromTrace(trace)` already converts a successful `tools/call` trace into a
  replay case. Capturing a chat run as a suite is a map over trace IDs.

## Non-goals

- **Not a productivity client.** No multi-server agent workflows, no attachments, no
  cross-session memory. If that becomes the goal later, nothing here blocks it.
- **No persisted transcripts.** See "Persistence" below.
- **No MCP `sampling` support in this scope.** An attached LLM makes it possible for the
  first time and it is a genuine differentiator, but it is a separate design.
- **No changes to how Agent Readiness scores existing heuristics.** We add a source; we do
  not reweight the ones already there.

## Decisions

| Question | Decision |
|---|---|
| Purpose | Test-bench for evaluating an MCP server |
| Providers | OpenAI-compatible, Anthropic, Gemini |
| Tool gating | Approve by default; risk-aware allowlist |
| Placement | Full overlay, transcript beside live trace |
| Tool scope | Selected server; other connected servers opt-in per run |
| Payoffs | Observation Journal, Replay Suites, Agent Readiness |
| Transports | Provider calls behind a new `llm` Host group |

## Architecture

### New module tree

All logic lives in `src/lib/agent/`. Every module is pure and unit-testable with its
network and MCP dependencies injected.

```
src/lib/agent/
├── types.ts          AgentMessage, ToolCallRequest, AgentEvent, LlmConfig
├── loop.ts           the model <-> tool cycle; emits AgentEvent, never fetches
├── gating.ts         approve / always-allow / risk-locked decisions
├── toolCatalog.ts    ToolDef[] -> provider tool schemas, per scope selection
├── observations.ts   AgentEvent[] -> derived findings (the persisted record)
└── providers/
    ├── index.ts      LlmProvider interface + registry
    ├── openai.ts     /v1/chat/completions, tool_calls
    ├── anthropic.ts  /v1/messages, tool_use / tool_result blocks
    └── gemini.ts     :generateContent, functionCall / functionResponse
```

A provider adapter has exactly one job: map our `AgentMessage[]` plus a tool catalog into
that vendor's request body, and map its streamed response back into our events. Nothing
else belongs there.

### The `llm` Host group

A fourth group beside `mcp`, `secrets`, `files`, `updates`:

```ts
export interface LlmHost {
  chat(
    req: LlmRequest,
    onDelta: (delta: LlmDelta) => void,
    signal: AbortSignal,
  ): Promise<LlmResponse>;
  /** Model discovery for local servers (Ollama, LM Studio). */
  listModels(config: LlmConfig): Promise<string[]>;
}
```

- **Browser** posts to a new same-origin `/__llm_proxy`.
- **Electron** forwards over the preload bridge; main fetches directly.

Both are implementable, so the seam rule holds. The browser build genuinely needs the
proxy: Anthropic requires an explicit `anthropic-dangerous-direct-browser-access` opt-in
header, and Ollama rejects cross-origin requests unless the user has set `OLLAMA_ORIGINS`,
which most have not. Routing through the proxy makes local models work on first try.

Tracing stays out of host implementations, per the existing rule. LLM traffic is not MCP
traffic and does **not** enter `protocolTrace.ts`; the tool calls it causes do, via
`mcpClient.ts`, unchanged.

### Server-side

One new file, `llm-proxy.js`, at the repo root, with zero runtime dependencies, exporting
`handleLlmProxy` and `LLM_PROXY_PATH`. Registered beside the existing four interceptors in
both `server.js` and `vite.config.ts`.

Unlike `proxy.js` it is **not** a general relay. The request names a configured provider;
the proxy resolves the target from that provider's base URL and refuses anything else. It
never logs request or response bodies.

### Files changed outside the new tree

- `src/lib/host/types.ts` — add `llm` to `Host`
- `src/lib/host/browser/llmBrowser.ts`, `src/lib/host/electron/llmElectron.ts`, plus both
  `index.ts` files
- `electron/ipc/channels.js` — new channel names
- `electron/ipc/llmHandlers.js` — new handler module
- `electron/preload.cjs` — bridge surface (channel names duplicated by design)
- `electron/main.js` — register the handlers
- `electron-builder.yml` — `llm-proxy.js` added to the `files` allowlist
- `package.json` — `llm-proxy.js` added to `files`
- `src/App.tsx` — one overlay toggle, mirroring the Scenario Runner
- `src/lib/appData.ts` — `agentRuns` field, `version` 2
- `src/lib/agentReadiness.ts` — a fourth issue source

`node scripts/check-packaged-imports.mjs` must pass; it exists to catch exactly the
`electron-builder.yml` omission above.

## The agent loop

`loop.ts` is a driver with injected dependencies and one event stream:

```ts
runAgentTurn(
  { sendToModel, callTool, gate, maxTurns },
  state,
): AsyncIterable<AgentEvent>
```

The cycle:

1. Build the request: system prompt + history + tool catalog.
2. Stream from the model, emitting `model_delta` events.
3. If the response carries tool calls, ask `gate` about each one.
4. Execute the approved calls through `mcpClient.callTool`.
5. Append results to history and repeat, until the model answers with no tool calls or
   `maxTurns` is reached.

`maxTurns` defaults to 8 and is user-adjustable. It is the only thing standing between a
tool-calling loop and an unbounded API bill.

### Denial is fed back to the model

When the user denies a call, the loop appends a tool result stating the user refused and
lets the model continue. It does **not** abort the run. How a model recovers from a refused
tool is itself an agent-readiness finding, and aborting would discard it.

### The deny button asks why

Deny offers a reason, and each reason maps to exactly one counter in `AgentRunSummary`:

| Reason | Counter | Readiness meaning |
|---|---|---|
| `Wrong tool` | `wrongToolPicks` | Descriptions do not disambiguate this tool from its neighbours |
| `Bad arguments` | `badArgDenials` | The schema does not constrain the model into valid input |
| `Unsafe` | none | A judgement about the tool's power, already covered by Permission Surface |
| `Just no` | none | Deliberately unattributed — an escape hatch, not a signal |

Nothing can reliably detect "the model picked the wrong tool" automatically. Making the
human the oracle at the moment they are already reading the call costs one click and
produces the signal that Agent Readiness consumes. This is deliberate, not a stopgap.

Two of the four reasons intentionally record nothing. A reason list where every option
feeds the score would pressure users into miscategorising a refusal to make it "count".

### Gating rules

`gating.ts` reads the profiles `permissionSurfaceAudit.ts` already computes.

- A tool tagged `destructive`, `shell`, `credential`, or `admin` is **risk-locked**:
  "always allow" is unavailable and it asks on every call.
- Every other tool may be session-allowlisted with one click.
- The allowlist is per run and never persisted.

## Providers and credentials

`LlmProvider` exposes `buildRequest`, `parseStream`, and `listModels`, so an adapter is a
pure mapping function plus a stream parser — testable against recorded fixture bytes with
no live calls.

Configuration lives in the **vault**, as a sibling of the server list, not a new store:

```ts
interface LlmConfig {
  id: string;
  label: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  baseUrl: string;
  model: string;
  apiKey?: string;          // absent for local models
  extraHeaders?: Record<string, string>;
}
```

Local models leave `apiKey` empty. There is one storage path and no plaintext credential
store anywhere, per the rule in `CLAUDE.md`.

The vault decrypts in the renderer, so the API key is in renderer memory in every possible
design. The proxy buys CORS compatibility and seam consistency, not key isolation; it is
not sold as a security boundary.

## Persistence

**Transcripts are never persisted.** Two reasons:

1. Agent Readiness needs a durable per-server signal, not a durable transcript. Derived
   observations are enough and far smaller.
2. A transcript contains raw tool results from the server under investigation — exactly the
   material that should not sit in `data.gz`.

Transcripts are ephemeral, like protocol traces. What persists is compact:

```ts
interface AgentRunSummary {
  serverId: string;
  runs: number;
  wrongToolPicks: number;
  badArgDenials: number;
  toolErrors: number;
  unrecoveredErrors: number;
  lastRunAt: number;
}
```

Stored as `AppData.agentRuns: Record<string, AgentRunSummary>`. `AppData.version` bumps to
2; `parseAppData` already defaults missing fields, so older data loads unchanged.

## The three payoffs

**Replay Suites.** "Capture this run as a suite" maps the run's `tools/call` trace IDs
through the existing `buildReplayCaseFromTrace`. No new conversion logic.

**Observation Journal.** A "Record" affordance on any tool call or model message calls the
existing `addInvocationObservation()` against that server.

**Agent Readiness.** `analyzeToolReadiness` currently composes `toolMetadataIssues +
schemaIssues + traceIssues`. Add `agentIssues(tool, context, summary)`, fed by
`AgentRunSummary`. Severities follow the existing scale; no existing heuristic is
reweighted.

## UI

A full-width overlay opened from the toolbar, following the Scenario Runner precedent — an
LLM-driven multi-step call chain beside the hand-authored one. `App.tsx` owns only the
open/closed flag.

```
  Back to servers        [ claude-sonnet-5 v ]
  --------------------------|-------------------
  you: list my repos        |  LIVE TRACE
                            |
  * wants: list_repos       |  tools/list   12ms
    { limit: 20 }           |  tools/call  340ms
    [Allow] [Always allow]  |    +- list_repos ok
                            |  tools/call  PAUSED
  ok returned 20 items      |
  model: You have 20 rep..  |  [to Journal] [Replay]
  --------------------------|-------------------
  > ask something...                     [Send]
```

Components (rendering only, no business logic):

- `AgentChatPanel.tsx` — the overlay shell and run state
- `AgentTranscript.tsx` — message and tool-call rendering
- `ToolCallApproval.tsx` — the gate, including the deny-reason choice
- `AgentModelPicker.tsx` — provider/model selection, opt-in server checkboxes
- `useAgentRun.ts` — hook over `loop.ts`

The toolbar entry is always present. With no `LlmConfig` saved, opening the overlay shows
the provider setup form instead of a transcript; with no server connected, it shows the
same prompt the rest of the app uses. Sending is disabled until both exist.

## Error handling

- **Model call fails** (bad key, refused connection, rate limit): surfaced inline in the
  transcript with the provider's message, run paused, retry available. No `lastError`-style
  swallowing — this is always user-initiated.
- **Tool call fails:** the MCP error is fed to the model as a tool result. The model's
  recovery is the observation; `toolErrors` increments, and `unrecoveredErrors` increments
  if the run ends without a successful retry or a coherent answer.
- **Turn limit reached:** run stops with an explicit `turn_limit` event, not silently.
- **Abort:** every run carries an `AbortSignal`; closing the overlay or clicking stop
  cancels the in-flight model call and any pending tool call.
- **Vault locked:** the overlay is unavailable, consistent with the server list.

## Testing

Unit (Vitest, TDD):

- `loop.test.ts` — fake model and fake tools cover every branch: multi-turn tool use,
  denial-and-recovery, tool error, turn limit, abort
- `gating.test.ts` — risk-locked categories, allowlist behaviour
- `toolCatalog.test.ts` — scope selection, schema mapping
- `providers/*.test.ts` — request shape and stream parsing per vendor, against recorded
  fixture bytes
- `observations.test.ts` — event stream to `AgentRunSummary`
- `agentReadiness.test.ts` — the new `agentIssues` source
- `llm-proxy.test.js` — target validation, header handling, no body logging

End-to-end:

- `tests/fixtures/llm-server.mjs` — a fake OpenAI-compatible model with scripted responses,
  so both Playwright suites exercise the real agent loop with no cloud calls and no API
  key. Without this fixture none of the feature is CI-testable.
- `tests/release/26-agent-chat.spec.ts` — configure a provider, run a scripted turn,
  approve a call, deny a call with a reason, capture as a replay suite, record to the
  journal
- `tests/electron/08-agent-chat.spec.ts` — provider egress from the main process with no
  proxy involved

## Release gate

Per `CLAUDE.md`, in the same branch:

1. `tests/release/26-agent-chat.spec.ts` and `tests/electron/08-agent-chat.spec.ts`
2. `.cursor/skills/prepare-for-release/SKILL.md` — new §3.26 section, updated test counts
   for both suites
3. `README.md` (all three ways to run) and `README.npm.md` (CLI) — the feature, provider
   setup, and the fact that credentials live in the vault

## Phasing

The spec covers the whole feature; delivery is staged so the loop is proven before the
adapter count grows.

**Phase 1 — OpenAI-compatible, end to end.** The `llm` Host group, `llm-proxy.js`,
`loop.ts`, `gating.ts`, `toolCatalog.ts`, `observations.ts`, the `openai.ts` adapter, the
overlay, all three payoffs, both Playwright specs, docs. This alone covers Ollama, LM
Studio, llama.cpp, vLLM, OpenAI, Groq, OpenRouter, Together, and DeepSeek.

**Phase 2 — Anthropic and Gemini adapters.** Two files plus two test files against the
proven interface, and a provider-picker entry each. No architectural change.

Phase 1 is a shippable feature on its own. Phase 2 is additive.

## Open risks

- **Provider drift.** Three vendor APIs change independently. Contained to one file each,
  with fixture-based tests that fail loudly rather than silently mis-mapping.
- **Cost surprise.** `maxTurns` bounds a single run, but nothing bounds a session. If this
  proves to be a real complaint, a per-run token counter in the header is the follow-up.
- **`unrecoveredErrors` is heuristic.** Deciding a run "ended without a coherent answer" is
  a judgement call. Start conservative: count it only when the final model message is
  itself an error or the run hit the turn limit mid-tool-loop.
