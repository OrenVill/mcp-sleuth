# Design: Playwright Pre-Release Test Suite

**Date:** 2026-05-25  
**Branch:** `feat/playwright-release-suite`  
**Covers:** SKILL.md §3 (Playwright UI walkthrough), sections 3.1–3.21

---

## 1. Goal

Automate the Playwright pre-release walkthrough defined in `.cursor/skills/prepare-for-release/SKILL.md` sections 3.1–3.21 so that the checklist can be run with a single `npx playwright test` command instead of a manual walkthrough.

The suite is not a substitute for exploratory testing but gives a repeatable, fast signal that no major regression has been introduced before merging the release-please PR.

---

## 2. Constraints

- **Target server:** built preview server at `http://127.0.0.1:4173` (`vite preview --port 4173`), matching the SKILL.md instruction to prefer the built output over the dev server.
- **Fixture MCP server:** always running at `http://localhost:3001/mcp` externally. The suite does not start or stop it.
- **Unreachable server:** tests for error/disconnected state use `http://localhost:9999/mcp` (nothing listening).
- **Browser:** Chromium only. Cross-browser coverage is irrelevant for a pre-release UI walkthrough.
- **Workers:** 1 (serial). These are stateful UI tests; parallelism would cause race conditions on the same app instance.

---

## 3. File Structure

```
tests/
  release/
    helpers.ts                        # shared helpers: addServer, selectServer, openDevTools
    01-initial-load.spec.ts           # §3.1  Initial load / empty state
    02-add-server.spec.ts             # §3.2  Add Server dialog
    03-connection-error.spec.ts       # §3.3  Server connection error state
    04-tab-bar.spec.ts                # §3.4  Tab bar — Tools / Resources / Prompts
    05-live-fixture-server.spec.ts    # §3.5  Live MCP fixture server
    06-tool-forms.spec.ts             # §3.6  Tool forms — all input types
    07-result-pane.spec.ts            # §3.7  Result pane — rich rendering
    08-call-history-diff.spec.ts      # §3.8  Call history — semantic diff
    09-bookmarks.spec.ts              # §3.9  Bookmarks persistence
    10-search.spec.ts                 # §3.10 Cross-server search
    11-export.spec.ts                 # §3.11 Export / documentation generation
    12-meta-tool-discovery.spec.ts    # §3.12 Meta-tool discovery
    13-resources.spec.ts              # §3.13 Resources tab
    14-prompts.spec.ts                # §3.14 Prompts tab
    15-protocol-inspector.spec.ts     # §3.15 Protocol Inspector
    16-replay-suites.spec.ts          # §3.16 Replay Suites
    17-schema-lab.spec.ts             # §3.17 Schema Lab
    18-agent-readiness.spec.ts        # §3.18 Agent Readiness
    19-client-config-export.spec.ts   # §3.19 MCP Client Config Export
    20-handoff-readme.spec.ts         # §3.20 Handoff README Export
    21-scenario-runner.spec.ts        # §3.21 Scenario Runner
```

---

## 4. playwright.config.ts Changes

Update the existing `playwright.config.ts` (currently has a stub config with no webServer):

```ts
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,         // serial — stateful UI tests
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'on',           // SKILL.md asks for screenshots at each step
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'vite preview --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,  // works if server already up (dev loop) or in CI
  },
});
```

No changes to vitest config or existing `.test.ts` files.

---

## 5. helpers.ts

Three shared helpers:

### `addServer(page, name, url)`
Clicks `+ Add` in the sidebar, fills Name and URL fields, submits the form. Waits for the server to appear in the sidebar.

### `selectServer(page, name)`
Locates the named server entry in the sidebar and clicks it. Waits for the middle column to update.

### `openDevTools(page, tab?)`
Clicks the Dev Tools button in the top header. If `tab` is provided, clicks that tab within the modal (e.g. `'Protocol Inspector'`, `'Replay Suites'`, `'Schema Lab'`, `'Agent Readiness'`).

---

## 6. State Isolation

Each spec file runs in a **fresh browser context** (Playwright default). localStorage and IndexedDB are empty at the start of each file.

Within a file, a `beforeAll` or the first `test()` block sets up any required servers. Subsequent tests in the same file share that context.

**§3.9 (bookmarks persistence):** the test reloads the page within the same context (`page.reload()`) and then re-checks the bookmark state — this is intentional, matching the SKILL.md check that bookmarks survive a hard reload.

---

## 7. Assertion Strategy

Each SKILL.md bullet point maps to one or more Playwright assertions:

| SKILL.md says | Playwright assertion |
|---|---|
| "confirm X is visible" | `expect(locator).toBeVisible()` |
| "confirm X is not present / empty state" | `expect(locator).not.toBeVisible()` or `toHaveCount(0)` |
| "screenshot the full page" | `page.screenshot({ fullPage: true })` |
| "confirm no uncaught JS errors" | `page.on('pageerror', ...)` collected in `beforeAll`, asserted empty |
| "confirm clipboard receives JSON" | `page.evaluate(() => navigator.clipboard.readText())` |
| "confirm Code/Preview toggle" | `expect(page.getByRole('tab', { name: 'Preview' })).toBeVisible()` |
| "confirm markdown renders as styled HTML" | `expect(locator.locator('h1, h2, strong, ul')).not.toHaveCount(0)` |
| "confirm syntax-highlighted tokens" | `expect(locator.locator('[class*="shiki"], [style*="color"]')).not.toHaveCount(0)` |
| "confirm semantic diff (3-column)" | assert presence of old-value, path, new-value columns |

---

## 8. Section-by-Section Notes

### §3.1 — Initial load / empty state
- Navigate to `/`.
- Assert: sidebar visible, no server entries, `+ Add` button present, middle/right columns show empty-state text (not blank, not error).

### §3.2 — Add Server dialog
- Click `+ Add`.
- Assert dialog open with Name, URL, Description fields.
- Fill Name=`Test`, URL=`http://localhost:9999/mcp`. Submit.
- Assert server `Test` appears in sidebar.

### §3.3 — Server connection error state
- Click `Test` server.
- Assert: error/disconnected indicator shown, no white screen, no unhandled JS exception.

### §3.4 — Tab bar
- Assert: Tools, Resources, Prompts tabs present in middle column.
- Click each tab; assert no crash (tab panel renders).

### §3.5 — Live fixture server
- Add server `Fixture` with URL `http://localhost:3001/mcp`.
- Assert: connects successfully, tools list non-empty, Resources tab non-empty, Prompts tab non-empty.

### §3.6 — Tool forms (all input types)
- Requires fixture server connected.
- Find tools that expose string, number, boolean, enum, object/array params.
- Assert correct input element type for each.
- For object/array: type `{"key":"value"}` into textarea, assert characters appear (regression guard for v0.5.x bug).

### §3.7 — Result pane rich rendering
- Invoke a markdown-returning tool; assert Code/Preview toggle; click Preview → assert styled HTML elements; click Code → assert Shiki tokens.
- Invoke a JSON-returning tool; assert Shiki-highlighted, pretty-printed JSON.
- Open an HTML resource; assert Code/Preview toggle; Preview → iframe; Code → Shiki XML.
- If image resource available: assert `<img>` tag. SVG: assert Code/Preview, Preview renders image, Code shows Shiki XML.

### §3.8 — Call history semantic diff
- Invoke same tool twice with different args.
- Open call history panel.
- Assert: 3-column layout (old value | path | new value), not a line-diff.

### §3.9 — Bookmarks persistence
- Bookmark a tool.
- Assert bookmark icon state changes.
- `page.reload()`.
- Assert bookmark still active (persisted to disk via compressed appData).

### §3.10 — Cross-server search
- With fixture server connected, type partial tool name in search.
- Assert results appear from the correct server and list filters correctly.

### §3.11 — Export / documentation generation
- With at least one tool invoked, open Export dialog.
- Assert output tab renders.
- Assert download/copy button present and triggers without JS error.

### §3.12 — Meta-tool discovery
- Connect to a server exposing a meta-tool (`list_tools`, `search_tools`, etc.).
- Assert "Discover all tools" button visible.
- Click it; assert discovered tools appear in collapsible section.
- Click a discovered tool; assert detail form opens and is invokable.

### §3.13 — Resources tab
- Navigate to Resources tab on fixture server.
- Assert resources listed with name and MIME type.
- Click a text resource; assert ResourceDetail renders with content.
- If markdown/HTML: assert Code/Preview toggle.
- If URI template resources: assert variable inputs render.

### §3.14 — Prompts tab
- Navigate to Prompts tab on fixture server.
- Assert prompts listed.
- Click a prompt; assert argument form with descriptions below each field.
- Submit; assert rendered messages. If markdown content: assert Code/Preview toggle.

### §3.15 — Protocol Inspector
- Open Dev Tools → Protocol Inspector.
- Click Clear; assert empty state.
- Disconnect and reconnect fixture server; invoke tool, read resource, fetch prompt.
- Assert timeline entries for `initialize`, `tools/list`, `tools/call`, `resources/list`/`resources/read`, `prompts/list`/`prompts/get`.
- Click an entry; assert params, result/error, status, server name, timestamp, duration all render.
- If server doesn't implement resources/prompts: assert `unsupported` (not `error`).
- Click Copy event; assert clipboard has JSON.
- Select two entries with Select for diff; assert side-by-side diff with field changes.
- Click Reset diff; assert event detail view returns.
- Click Clear; assert empty state returns.

### §3.16 — Replay Suites
- Open Dev Tools → Replay Suites.
- Invoke two tools; assert they appear under Successful tool calls.
- Create a suite, add both calls; assert each case shows args and expected result snapshot.
- Click Replay; assert pass/fail, duration, result diffs shown.
- Assert closing and reopening Dev Tools in same session keeps suite in memory.
- Assert reloading the page clears the suite.

### §3.17 — Schema Lab
- Open Dev Tools → Schema Lab.
- Assert server and tool selectors present.
- Select a tool with required args; assert required fields highlighted.
- Assert schema summary shows root type, property count, required count, optional count.
- Assert Schema/Form Preview shows input schema beside generated form.
- Assert input types: string enums → dropdowns, numbers → number inputs, booleans → boolean dropdowns, objects/arrays → JSON textarea.
- Assert generated example args visible and deterministic.
- Assert renderer warnings for nested objects, arrays, `oneOf`/`anyOf`/`allOf`, unsupported formats.
- Assert validation notes render (positive for valid schema, warning/error for malformed).
- Click Copy args; assert clipboard has JSON args.
- Click Copy call; assert clipboard has JSON-RPC `tools/call` payload with `method`, `params.name`, `params.arguments`.
- From tool detail page, click Schema Lab link beside Arguments; assert Dev Tools opens to Schema Lab for that tool.

### §3.18 — Agent Readiness
- Connect to fixture server.
- Assert each tool row shows a readiness score badge.
- Select a tool; assert tool detail header shows same score.
- Open Dev Tools → Agent Readiness.
- Assert overall score, verdict, tool count, ready count, critical issue count, high issue count.
- Use server/tool selectors; assert selected tool's score and issues with recommended fixes.
- Assert camelCase names (`searchDocs`) are not penalized.
- Assert weak tools surface deterministic issues.
- Assert report works with no trace history and requires no AI API key.

### §3.19 — MCP Client Config Export
- Open Export dialog on fixture server → Client Config tab.
- Assert Target sub-nav shows Cursor, Claude, VS Code.
- Select each; assert valid JSON snippet (correct key names per target).
- For bearer auth: assert `${env:SERVER_TOKEN}` placeholder, no real token.
- For API key auth: assert header placeholder; VS Code uses `${input:...}`.
- For basic auth: assert `Authorization` placeholder, no credentials.
- For `proxyThroughLocal` server: assert exported URL is real server URL, not localhost proxy.
- Click Copy; assert clipboard is valid JSON.
- Click Download; assert filename includes server slug and client target.

### §3.20 — Handoff README Export
- Open Export dialog → Handoff README tab.
- Assert checkboxes: Readiness, Full Schemas, Examples, Replay Suites.
- With all checked: assert preview includes server name/URL, tool list, agent readiness score, examples section.
- Toggle Full Schemas; assert JSON schema blocks appear/disappear.
- Toggle Readiness; assert readiness section appears/disappears.
- Assert sensitive arg keys (`apiKey`, `token`, `password`) are shown as `[REDACTED]`.
- Switch Code/Preview; assert markdown renders correctly in Preview.
- Click Download; assert filename is `<server-slug>-handoff.md`.

### §3.21 — Scenario Runner
- Click Scenarios in top header.
- Assert panel opens with empty sidebar and prompt to create scenario.
- Type scenario name, press + or Enter; assert scenario appears in sidebar and editor loads.
- Click + Add Step; assert tool selector lists connected tools.
- Edit Arguments JSON with invalid JSON; assert inline error.
- Add assertion; assert type selector shows Status, Field exists, Field missing, JSON path equals, Contains text.
- Set Status → success assertion.
- Click Run; assert: no crash, pass/fail badge on step result, assertion result badges with ✓/✗ and message, header shows pass/fail count.
- Add second step with JSON path equals assertion on known field; assert passing result.
- Add step with contains text assertion where text absent; assert failing result without crash.
- Create second scenario; assert first scenario results persist while switching.
- Remove a step; assert scenario updates immediately.
- Close panel; assert closes cleanly.

---

## 9. npm script

Add to `package.json`:

```json
"test:e2e": "playwright test"
```

---

## 10. Out of Scope

- §3.1–3.21 coverage is complete; §1 (static checks) and §2 (CLI smoke test) from the SKILL.md remain manual.
- No cross-browser runs (Firefox, WebKit).
- No mobile viewport tests.
- The fixture server implementation is external; this suite assumes it is running.
