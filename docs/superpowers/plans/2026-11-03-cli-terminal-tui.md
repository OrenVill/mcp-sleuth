# MCP Detective Terminal TUI — Phase 3–4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mcp-detective tui` — a full-screen Ink terminal UI for server browsing, tool/resource/prompt invocation, dev-tool panels, and approval-gated Agent Chat using the same libs as the web app.

**Architecture:** Reuse Phase 1 `cli-core` (vault prelude, MCP connect, app-data); add Ink React tree under `src/cli/tui/`; implement `AgentLoopDeps` in `src/cli/tui/agentRun.ts` with Node LLM fetch from `src/cli/core/llmFetch.ts`.

**Tech Stack:** Ink 5, React 19 (bundled), Phase 1 CLI bundle, `runAgentTurn`, existing provider adapters.

**Spec:** `docs/superpowers/specs/2026-11-03-cli-tui-design.md`

**Depends on:** `docs/superpowers/plans/2026-11-03-cli-terminal-phase1.md` merged (Waves 0–4).

## Global Constraints

- Same security rules as spec: transcripts **never** persisted; Allow not default-focused on tool approval; LLM URLs via `requireAllowedTarget`.
- **New npm dependencies:** `ink`, `ink-spinner` (optional) — add to `dependencies` for published CLI bundle.
- Do not grow `bin/mcp-detective.js`; entry remains `dist/cli/main.ts` → `tui` subcommand.
- Protocol trace for TUI: in-memory only, redact auth keys like `protocolTrace.ts`.

---

## File structure

**Created**

| File | Responsibility |
|------|----------------|
| `src/cli/core/llmFetch.ts` | `sendToModel(config, req, signal): AsyncIterable<LlmStreamEvent>` |
| `src/cli/core/llmFetch.test.ts` | Allowlist + mock fetch |
| `src/cli/core/protocolTraceCli.ts` | Minimal trace store for TUI inspector |
| `src/cli/tui/App.tsx` | Root Ink app, routing screens |
| `src/cli/tui/SessionContext.tsx` | Vault + connections + selection state |
| `src/cli/tui/ServerColumn.tsx` | Server list |
| `src/cli/tui/BrowserColumn.tsx` | Tools/resources/prompts tabs |
| `src/cli/tui/DetailColumn.tsx` | Invoke + result |
| `src/cli/tui/DevToolsMenu.tsx` | Panel launcher |
| `src/cli/tui/panels/*.tsx` | One file per dev-tool surface |
| `src/cli/tui/chat/ChatOverlay.tsx` | Agent chat shell |
| `src/cli/tui/chat/ApprovalPrompt.tsx` | Gate UI + deny reasons |
| `src/cli/tui/chat/agentRun.ts` | `AgentLoopDeps` implementation |
| `src/cli/tui/chat/agentRun.test.ts` | Deny reason → loop continues (mock deps) |
| `src/cli/commands/tui.ts` | Subcommand entry: run Ink app |
| `src/cli/tui/keymap.ts` | Central key bindings |

**Modified**

| File | Change |
|------|--------|
| `src/cli/main.ts` | Register `tui` command |
| `scripts/build-cli.mjs` | Mark `react`/`ink` as bundle entries |
| `package.json` | Add `ink` dependency |
| `README.md` | TUI section, keybindings table |

---

## Wave 5 — LLM fetch + TUI shell

### Task 13: Node LLM fetch (TDD)

**Files:**
- Create: `src/cli/core/llmFetch.ts`, `llmFetch.test.ts`

**Interfaces:**
- Produces: `streamChat(config: LlmConfig, body: ProviderRequest): AsyncIterable<LlmStreamEvent>` using `src/lib/agent/providers/index.ts` parser + `requireAllowedTarget`.

- [ ] **Step 1:** Test rejects `file:` URL and unknown provider.

- [ ] **Step 2:** Test happy path with mocked `fetch` Response stream (OpenAI fixture chunk).

- [ ] **Step 3:** Commit `feat(cli): Node LLM streaming with allowlist`.

### Task 14: Ink bootstrap + session context

**Files:**
- Create: `src/cli/tui/App.tsx`, `SessionContext.tsx`, `src/cli/commands/tui.ts`

- [ ] **Step 1:** `tui` command runs prelude then mounts `<App />` with Ink.

- [ ] **Step 2:** Context holds `selectedServerId`, `connections`, unlock state.

- [ ] **Step 3:** Smoke test: run with `CI=1` and mock stdin (or skip in vitest; document manual `mcp-detective tui`).

- [ ] **Step 4:** Commit `feat(tui): ink shell and session context`.

### Task 15: Three-column browse + invoke

**Files:**
- Create: `ServerColumn.tsx`, `BrowserColumn.tsx`, `DetailColumn.tsx`

- [ ] **Step 1:** List servers; Enter connects via `mcpConnect`.

- [ ] **Step 2:** Tab tools/resources/prompts; invoke tool with JSON args prompt.

- [ ] **Step 3:** Display result text (truncate wide output).

- [ ] **Step 4:** Commit `feat(tui): browse and invoke tools`.

---

## Wave 6 — Dev tool panels

### Task 16: Readiness, permission, injection panels

**Files:**
- Create: `src/cli/tui/panels/ReadinessPanel.tsx`, `PermissionPanel.tsx`, `InjectionPanel.tsx`

- [ ] **Step 1:** Each panel calls same lib functions as React DevTools; scrollable markdown text.

- [ ] **Step 2:** Commit `feat(tui): trust evaluator panels`.

### Task 17: Schema lab, journal, replay, scenario

**Files:**
- Create: remaining panels + wire `appDataNode` writes for journal

- [ ] **Step 1:** Journal notes persist through app-data handler.

- [ ] **Step 2:** Replay/scenario in-memory consistent with `replaySuites.ts` / `scenarioRunner.ts`.

- [ ] **Step 3:** Commit `feat(tui): schema lab journal replay scenario`.

### Task 18: Protocol trace panel

**Files:**
- Create: `protocolTraceCli.ts`, `ProtocolPanel.tsx`

- [ ] **Step 1:** Hook MCP connect wrapper to push redacted events.

- [ ] **Step 2:** Panel lists last N calls.

- [ ] **Step 3:** Commit `feat(tui): protocol inspector`.

---

## Wave 7 — Agent Chat

### Task 19: Approval prompt (TDD)

**Files:**
- Create: `ApprovalPrompt.tsx`, `agentRun.test.ts`

- [ ] **Step 1:** Test state machine: new call resets deny UI; Allow requires explicit key (`y`), not default Enter on first focus.

- [ ] **Step 2:** Implement deny reason selection matching `DenyReason` type.

- [ ] **Step 3:** Commit `feat(tui): tool approval gate`.

### Task 20: Chat overlay + agent loop

**Files:**
- Create: `ChatOverlay.tsx`, `agentRun.ts`

**Interfaces:**
- Consumes: `runAgentTurn`, `llmFetch.streamChat`, `mcpConnect.callTool`, `gating.ts`, `toolCatalog.ts`

- [ ] **Step 1:** Model picker from vault configs; server scope checkboxes.

- [ ] **Step 2:** Wire `runAgentTurn`; stream assistant deltas to transcript.

- [ ] **Step 3:** On completion, `agentRunStore` persist summary only.

- [ ] **Step 4:** Commit `feat(tui): agent chat with approval-gated tools`.

### Task 21: Docs + release skill

- [ ] **Step 1:** README keybindings and chat limitations (no transcript persistence).

- [ ] **Step 2:** Release skill: note TUI manual smoke (optional CI skip if no TTY).

- [ ] **Step 3:** Commit `docs: TUI usage`.

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Ink TUI 3-column | Tasks 14–15 |
| Dev tools parity | Tasks 16–18 |
| Agent Chat + approval | Tasks 19–20 |
| LLM allowlist | Task 13 |
| Transcript not persisted | Task 20 (summary only) |

No TBD placeholders in task list; panel UIs may iterate visually without changing contracts.

---

## Execution handoff

Start after Phase 1 plan is merged. Prefer **Wave 5 → 7** in order; Tasks 16–18 can parallelize if panel files stay disjoint.
