---
name: prepare-for-release
description: Pre-release checklist for mcp-explorer. Run before merging the release-please PR or triggering npm publish. Covers build, tests, lint, and the automated Playwright release suite.
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

## 3. Playwright release suite

The fixture server at `http://localhost:3001/mcp` must be running before this step.

Run the full automated release suite:

```bash
npx playwright test tests/release/
```

All 98 tests must pass (4 conditional skips are acceptable — they fire only when the fixture server lacks a specific tool type). Any failure blocks the release.

The suite covers §3.1–3.22 of the release spec: initial load, server add/error, tab bar, fixture connection, tool forms, result pane rendering, call history diff, bookmarks persistence, cross-server search, export dialog, meta-tool discovery, resources tab, prompts tab, Protocol Inspector, Replay Suites, Schema Lab, Agent Readiness, Client Config Export, Handoff README, Scenario Runner, and Trust evaluators (Permission Surface, Prompt Injection scan, Observation Journal).
All 96 tests must pass (4 conditional skips are acceptable — they fire only when the fixture server lacks a specific tool type). Any failure blocks the release.

The suite covers §3.1–3.22 of the release spec: initial load, server add/error, tab bar, fixture connection, tool forms, result pane rendering, call history diff, bookmarks persistence, cross-server search, export dialog, meta-tool discovery, resources tab, prompts tab, Protocol Inspector, Replay Suites, Schema Lab, Agent Readiness, Client Config Export, Handoff README, Scenario Runner, and stdio transport (local bridge + echo tool).

**§3.22 — Stdio transport (manual pass):** Add a stdio server with command `node` (or `process.execPath`) and args pointing at `tests/fixtures/stdio-mcp-server.mjs`; confirm the sidebar shows connected (green dot), the `echo` tool appears, invoking with a message returns that text in the result pane, and disconnect/reconnect still works. Automated: `tests/release/22-stdio-transport.spec.ts` (no HTTP fixture server required).

---

## 4. CHANGELOG and version

> **Note:** `CHANGELOG.md` and the `version` field in `package.json` are managed automatically by release-please after the agent approves the release PR. You do not need to edit them manually — just confirm they look correct before approving.

- Open `CHANGELOG.md` — confirm the top section matches the version being released and lists all merged PRs/commits since the last tag.
- Open `package.json` — confirm `"version"` matches.
- Confirm `README.md` (GitHub version) and `README.npm.md` (npm version) reflect any new commands or features in this release.

---

## 5. Final gate

All of the above pass → merge the release-please PR. The GitHub Action will:
1. Tag the commit (`vX.Y.Z`)
2. Create a GitHub Release with the changelog section
3. Run `npm publish` (which fires `prepublishOnly` → swaps README → publishes → `postpublish` → restores README)

After the Action completes, verify:
- `https://www.npmjs.com/package/@orenvill/mcp-explorer` shows the new version, and the README displayed is the npm-focused one (starts with install instructions, not the Layout section).
- In a clean shell: `npm install -g @orenvill/mcp-explorer@latest` → `mcp-explorer` → confirms it opens the browser correctly.
