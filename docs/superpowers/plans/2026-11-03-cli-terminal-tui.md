# MCP Detective Agent Chat TUI — Phase 3 Implementation Plan

> **Execution:** Use **`docs/superpowers/plans/2026-11-03-cli-terminal-parallel.md`** (Waves 9–12). This file is a task reference only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mcp-detective chat` (alias `tui`) — an Ink terminal UI **only** for approval-gated Agent Chat. All other app features stay CLI subcommands (see Phase 1–2 plan).

**Architecture:** Reuse Phase 1 `cli-core` (vault prelude, multi-server MCP connect); add `llmFetch.ts`; Ink app under `src/cli/chat/` implementing `AgentLoopDeps`.

**Tech Stack:** Ink 5, React 19 (bundled), `runAgentTurn`, existing provider adapters.

**Spec:** `docs/superpowers/specs/2026-11-03-cli-tui-design.md` (chat-only TUI section)

**Depends on:** `docs/superpowers/plans/2026-11-03-cli-terminal-phase1.md` merged (Waves 0–4).

## Global Constraints

- Transcripts **never** persisted; Allow not default-focused on tool approval; LLM URLs via `requireAllowedTarget`.
- **New npm dependencies:** `ink` (and bundle `react`) in `dependencies` for published CLI.
- No server browser, dev-tool panels, or tool invoke UI in Ink—only chat + approval + optional journal/replay actions from chat.

---

## File structure

**Created**

| File | Responsibility |
|------|----------------|
| `src/cli/core/llmFetch.ts` | Node streaming chat via providers + allowlist |
| `src/cli/core/llmFetch.test.ts` | |
| `src/cli/core/multiConnect.ts` | Connect multiple vault servers for chat scope |
| `src/cli/chat/App.tsx` | Ink root: transcript, composer, approval |
| `src/cli/chat/Transcript.tsx` | Messages + tool steps |
| `src/cli/chat/ApprovalPrompt.tsx` | Gate + deny reasons |
| `src/cli/chat/SetupPrompts.tsx` | Provider + server scope (Clack before Ink, or first Ink screen) |
| `src/cli/chat/agentRun.ts` | `AgentLoopDeps` |
| `src/cli/chat/agentRun.test.ts` | Approval / deny fed back to loop |
| `src/cli/commands/chat.ts` | `chat` + `tui` alias entry |

**Modified**

| File | Change |
|------|--------|
| `src/cli/main.ts` | Register `chat`; map `tui` → same handler |
| `scripts/build-cli.mjs` | Bundle Ink chunk lazily or split entry if size matters |
| `package.json` | Add `ink` |
| `README.md` | Document chat-only TUI |

**Not created (explicitly out of scope):** `ServerColumn`, dev-tool `panels/*`, `protocolTraceCli` for TUI.

---

## Wave 5 — LLM + multi-server connect

### Task 13: Node LLM fetch (TDD)

**Files:** `src/cli/core/llmFetch.ts`, `llmFetch.test.ts`

- [ ] **Step 1:** Test rejects unknown provider and disallowed path.

- [ ] **Step 2:** Test streamed OpenAI-compatible chunks → `LlmStreamEvent`s.

- [ ] **Step 3:** Commit `feat(cli): Node LLM streaming with allowlist`.

### Task 14: Multi-server connect for chat

**Files:** `src/cli/core/multiConnect.ts`, tests

**Interfaces:**
- Produces: `connectScope(serverIds: string[], stored: StoredServer[]): Promise<ChatMcpDeps>` with `callTool`, `getTools()` for catalog.

- [ ] **Step 1:** Test two mocked servers merge tool catalog with collision reporting from `toolCatalog.ts`.

- [ ] **Step 2:** Implement using `mcpConnect` / session manager.

- [ ] **Step 3:** Commit `feat(cli): multi-server MCP scope for chat`.

---

## Wave 6 — Chat Ink UI

### Task 15: Setup flow

**Files:** `SetupPrompts.tsx`, `commands/chat.ts`

- [ ] **Step 1:** After vault prelude, Clack-select provider config + in-scope servers (or flags `--provider`, `--servers` for non-interactive).

- [ ] **Step 2:** Mount Ink `<App />`.

- [ ] **Step 3:** Commit `feat(chat): provider and server scope setup`.

### Task 16: Approval prompt (TDD)

**Files:** `ApprovalPrompt.tsx`, `agentRun.test.ts`

- [ ] **Step 1:** Test Allow requires explicit confirm key; deny reasons match `DenyReason`.

- [ ] **Step 2:** Commit `feat(chat): tool approval gate`.

### Task 17: Transcript + agent loop

**Files:** `App.tsx`, `Transcript.tsx`, `agentRun.ts`

- [ ] **Step 1:** Wire `runAgentTurn` with `llmFetch`, `multiConnect`, gating.

- [ ] **Step 2:** Stream assistant text; show pending approval inline.

- [ ] **Step 3:** On finish, `agentRunStore` summary only; optional journal/replay hooks.

- [ ] **Step 4:** Commit `feat(chat): ink agent chat TUI`.

### Task 18: Docs

- [ ] **Step 1:** README: `mcp-detective chat`, alias `tui`, contrast with subcommands.

- [ ] **Step 2:** Commit `docs: agent chat terminal UI`.

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Chat-only Ink | Tasks 15–17 |
| No 3-column / dev panels | Omitted files |
| LLM allowlist | Task 13 |
| Multi-server scope | Task 14 |
| Transcript not persisted | Task 17 |

---

## Execution handoff

Start after Phase 1 plan merged. Waves 5 → 6 in order.
