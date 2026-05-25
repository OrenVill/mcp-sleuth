---
name: prepare-for-release
description: Pre-release checklist for mcp-explorer. Run before merging the release-please PR or triggering npm publish. Covers build, tests, lint, and a detailed Playwright UI walkthrough.
---

# Pre-Release Checklist — mcp-explorer

Use this skill before merging the release-please PR or publishing to npm.
Work through every section in order. Do not mark the release ready until all sections pass.

---

## 1. Static checks

Run all three in parallel — they are independent:

```bash
npm run build        # tsc -b + vite build → dist/
npm run lint         # eslint
npm test             # vitest run
```

All three must exit 0. A failing build means the published package is broken. A lint error or test failure blocks release.

---

## 2. CLI smoke test

Start the built output the way an end-user would (not the Vite dev server):

```bash
mcp-explorer --no-open   # or: node bin/mcp-explorer.js --no-open
```

Confirm:
- The process starts without error.
- It prints the ready line: `mcp-explorer  ➜  http://127.0.0.1:4173/`
- `curl -s http://127.0.0.1:4173/ | head -5` returns HTML (not an error page).

Then test the stop subcommand:

```bash
mcp-explorer stop
```

Confirm the process exits cleanly and the lock file is removed (check `bin/mcp-explorer.js` for the lock path).

**Why this matters:** The daemon/lock-file and stop subcommand were added in v0.6.0. If either is broken, the CLI is the user's primary entry point and the release is a regression.

---

## 3. npm publish dry run

```bash
npm publish --dry-run
```

Confirm:
- The tarball lists `dist/`, `bin/`, `server.js`, `README.md`.
- `README.md` in the tarball starts with the npm-focused install instructions (NOT the full GitHub README with a Layout section). This confirms the `prepublishOnly` swap script fired.
- No unexpected files (no `.claude/`, no `src/`, no `*.local`, no `.env`).

After the dry run completes, the `postpublish` script should have restored `README.md` to the GitHub variant. Verify:

```bash
head -20 README.md   # should show the full GitHub README, not the npm one
```

---

## 4. Playwright UI walkthrough

Start the built server (`mcp-explorer --no-open`, port 4173) — prefer this over the Vite dev server since it's what users actually install.

Use the Playwright MCP tools (the `playwright` server configured globally). Work through each area below. For each item, navigate to the relevant part of the UI, take a screenshot, and confirm the described behavior before continuing.

### 4.1 Initial load / empty state

- Navigate to `http://127.0.0.1:4173/`.
- Screenshot the full page.
- Confirm: left sidebar visible with no servers listed, a `+ Add` button present, middle and right columns show empty-state copy (not blank or errored).

### 4.2 Add Server dialog

- Click `+ Add`.
- Screenshot the open dialog.
- Confirm: Name field, URL field (placeholder suggesting `http://host:port/mcp`), optional Description field.
- Fill Name = `"Test"`, URL = `"http://localhost:9999/mcp"` (nothing listening there).
- Submit the form.
- Confirm: server appears in sidebar with a disconnected/error indicator — not a crash, not a blank state.

### 4.3 Server connection error state

- Click the `Test` server in the sidebar.
- Confirm: app shows a connection-failed or disconnected state — an error message or a "Connect" button. No white screen, no unhandled exception.
- Check the browser console for uncaught JS errors — there should be none.

### 4.4 Tab bar — Tools / Resources / Prompts

- After clicking the server, confirm the middle column shows a tab bar with at least **Tools**, **Resources**, and **Prompts** tabs.
- Click each tab; confirm each renders without crashing (they may be empty since the server is unreachable).

### 4.5 Tool forms — all input types

Requires a real connected MCP server. If none is available, note "not exercised — no live server" and skip to 4.6.

With a connected server that lists tools:
- **String param** → confirm a text `<input>` renders.
- **Number param** → confirm a number `<input>` renders.
- **Boolean param** → confirm a checkbox or toggle renders.
- **Enum param** → confirm a `<select>` renders with the correct options.
- **Object or array param** → confirm a **textarea** renders and accepts typed JSON. Type `{"key": "value"}` into it and confirm the characters appear. This was a bug fixed in v0.5.x — it is a regression risk.

### 4.6 Result pane — rich rendering

Tests the rich code rendering added in v0.6.0. Requires a connected server with invokable tools.

**Markdown text result:**
- Invoke a tool that returns markdown text.
- Confirm the result block shows a **Code / Preview** toggle.
- Click Preview → markdown renders as styled HTML prose (headings, bold, lists), not raw `**bold**` or `## heading`.
- Click Code → flips back to raw text, Shiki syntax-highlighted.

**Code block / JSON result:**
- Invoke a tool that returns JSON.
- Confirm the result is syntax-highlighted with colored tokens (Shiki), not plain monospace.
- Confirm JSON is pretty-printed, not collapsed to one line.

**HTML resource:**
- Open the Resources tab, click an HTML resource.
- Confirm the Code / Preview toggle appears.
- Preview → an `<iframe>` renders the HTML.
- Code → raw HTML is Shiki-highlighted.

**Image resource:**
- If the server exposes any image resource (PNG, JPEG, SVG), confirm it renders as an `<img>` tag, not a data dump.
- For SVG specifically: confirm the Code / Preview toggle exists. Preview renders the SVG as an image; Code shows the XML Shiki-highlighted.

**Export modal (fallback if no live server):**
- If tools have been invoked in this session, open the export dialog.
- Confirm the Shiki-highlighted code block renders inside the modal with colored tokens.
- If the export has a Markdown tab, confirm the **Code / Preview toggle** appears in the tab bar, and Preview renders prose.

### 4.7 Call history — semantic diff

- Invoke the same tool twice with slightly different arguments.
- Open the call history panel (history icon or tab near the tool detail area).
- Select two consecutive calls.
- Confirm a **semantic diff** is shown: a 3-column layout (old value | path | new value), NOT a raw line-level text diff.
- If arguments were identical, confirm it shows "no changes" or falls back gracefully rather than crashing.

### 4.8 Bookmarks persistence

- Click the bookmark icon on any tool.
- Confirm the icon changes state (bookmarked).
- Reload the page (F5 / hard reload).
- Confirm the bookmark persists — it is stored in compressed appData on disk, not just in memory.

### 4.9 Cross-server search

- If more than one server is connected, open the search UI and type a partial tool name.
- Confirm results come back from the correct server(s).
- With a single server, confirm search still filters the tool list correctly and doesn't crash.

### 4.10 Export / documentation generation

- With at least one tool invoked, open the Export dialog.
- Confirm the dialog renders output tab(s).
- Confirm the download/copy button is present and triggers without a JS error.

### 4.11 Meta-tool discovery ("Discover all tools")

- Connect to a server that exposes a meta-tool (`list_tools`, `search_tools`, `invoke_tool`, `get_manifest`, or similar).
- Confirm the **"Discover all tools"** button appears in the tool list column.
- Click it → confirm discovered tools appear in a collapsible section below the main list.
- Click a discovered tool → confirm its detail form opens and is invokable (routes through the proxy meta-tool).

### 4.12 Resources tab

- Navigate to the Resources tab on a connected server.
- Confirm resources are listed with name and MIME type.
- Click a text resource → ResourceDetail renders with correct content. For markdown or HTML content, the Code/Preview toggle must appear.
- If the server has resource templates (URI templates), confirm the variable inputs render correctly.

### 4.13 Prompts tab

- Navigate to the Prompts tab on a connected server.
- Confirm prompts are listed.
- Click a prompt → PromptDetail shows the argument form, with argument descriptions rendered below each input field.
- Submit the prompt → rendered messages appear. For any message content detected as markdown, confirm the Code/Preview toggle is present and functional.

---

## 5. CHANGELOG and version

- Open `CHANGELOG.md` — confirm the top section matches the version being released and lists all merged PRs/commits since the last tag.
- Open `package.json` — confirm `"version"` matches.
- Confirm `README.md` (GitHub version) and `README.npm.md` (npm version) reflect any new commands or features in this release.

---

## 6. Final gate

All of the above pass → merge the release-please PR. The GitHub Action will:
1. Tag the commit (`vX.Y.Z`)
2. Create a GitHub Release with the changelog section
3. Run `npm publish` (which fires `prepublishOnly` → swaps README → publishes → `postpublish` → restores README)

After the Action completes, verify:
- `https://www.npmjs.com/package/@orenvill/mcp-explorer` shows the new version, and the README displayed is the npm-focused one (starts with install instructions, not the Layout section).
- In a clean shell: `npm install -g @orenvill/mcp-explorer@latest` → `mcp-explorer` → confirms it opens the browser correctly.
