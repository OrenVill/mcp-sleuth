---
name: prepare-for-release
description: Pre-release checklist for mcp-sleuth. Run before merging the release-please PR or triggering npm publish. Covers build, tests, lint, the automated Playwright release suite, the Electron E2E suite, and desktop packaging.
---

# Pre-Release Checklist — mcp-sleuth

Use this skill before merging the release-please PR or publishing to npm.
Work through every section in order. Do not mark the release ready until all sections pass.

---

## 1. Static checks

Run all three in parallel — they are independent:

```bash
npm run build        # tsc -b + vite build → dist/
npm run lint         # eslint — src/, electron/, and the root Node modules
npm test             # vitest run — 377 tests
```

All three must exit 0. A failing build means the published package is broken. A lint error or test failure blocks release.

The release ships two artefacts from one repo — the npm CLI package and the desktop installers — so this checklist gates both.

---

## 2. CLI smoke test

Start the built output the way an end-user would (not the Vite dev server):

```bash
mcp-sleuth --no-open   # or: node bin/mcp-sleuth.js --no-open
```

Confirm:
- The process starts without error.
- It prints the ready line: `mcp-sleuth  ➜  http://127.0.0.1:4173/`
- `curl -s http://127.0.0.1:4173/ | head -5` returns HTML (not an error page).

Then test the stop subcommand:

```bash
mcp-sleuth stop
```

Confirm the process exits cleanly and the lock file is removed (check `bin/mcp-sleuth.js` for the lock path).

**Why this matters:** The daemon/lock-file and stop subcommand were added in v0.6.0. If either is broken, the CLI is the user's primary entry point and the release is a regression.

---

## 3. Playwright browser release suite

Playwright starts both servers itself — the static server on `127.0.0.1:4173` and the
MCP fixture on `127.0.0.1:3001` (`tests/fixtures/http-mcp-server.mjs`). No manual setup
is needed. To run the fixture on its own while debugging:

```bash
node tests/fixtures/http-mcp-server.mjs
```

Run the full automated release suite:

```bash
npx playwright test tests/release/
```

All 99 tests across 23 spec files must pass. Any failure blocks the release.

Two specs additionally connect to an external MCP server on the LAN
(`AWESOME_URL` in `tests/release/helpers.ts`): §3.6 (boolean-param tool) and §3.12
(meta-tool discovery). If that host is unreachable those two specs fail — check it
before assuming a regression.

The suite covers §3.1–3.22 of the release spec: initial load, server add/error, tab bar,
fixture connection, tool forms, result pane rendering, call history diff, bookmarks
persistence, cross-server search, export dialog, meta-tool discovery, resources tab,
prompts tab, Protocol Inspector, Replay Suites, Schema Lab, Agent Readiness, Client
Config Export, Handoff README, Scenario Runner, stdio transport (local bridge + echo
tool), and Trust evaluators (Permission Surface, Prompt Injection scan, Observation
Journal).

**Fixture content is load-bearing.** `http-mcp-server.mjs` documents which spec depends
on each tool, resource, and prompt it registers — read that header before changing it.
In particular no name or description may contain the word "fixture", because
`helpers.ts` locates the server row with a case-insensitive `hasText: 'Fixture'` match.

**§3.22 — Stdio transport (manual pass):** Add a stdio server with command `node` (or `process.execPath`) and args pointing at `tests/fixtures/stdio-mcp-server.mjs`; confirm the sidebar shows connected (green dot), the `echo` tool appears, invoking with a message returns that text in the result pane, and disconnect/reconnect still works. Automated: `tests/release/22-stdio-transport.spec.ts` (no HTTP fixture server required).

**§3.22 — Trust evaluators (manual pass):** With the fixture server connected, open Dev Tools and
check each of the three tabs renders for that server: **Permission Surface** (a per-category risk
summary, not a pass/fail score), **Prompt Injection** (findings with the matched text highlighted),
**Observation Journal** (add a note, set an approve/reject decision, export Markdown). A tab that
renders empty or throws for a connected server blocks release. Automated:
`tests/release/22-trust-evaluators.spec.ts`.

> Both spec files are numbered `22` and both declare `§3.22`. That is a known collision, not a
> mistake in this list. The next spec added should be `23`.

---

## 4. Electron E2E suite

The desktop app is a second shipped artefact and the browser suite does not exercise it: the
transport, the persistence path, and the window chrome are all different code.

```bash
npm run test:e2e:electron          # needs a display
xvfb-run -a npm run test:e2e:electron   # headless machine / CI
```

All 34 tests across 6 spec files must pass:

| Spec | Area |
|------|------|
| `01-launch.spec.ts` | Launch and security posture |
| `02-http-direct.spec.ts` | HTTP transport straight from the main process — no proxy |
| `03-stdio-direct.spec.ts` | Stdio spawned as a child process — no HTTP bridge |
| `04-native-persistence.spec.ts` | Vault and app-data files land in the data directory |
| `05-app-chrome.spec.ts` | Frameless window, title bar, window controls, menu |
| `06-dialogs.spec.ts` | In-app dialogs — vault reset confirm/cancel/Escape, no browser chrome |

The suite launches Electron against the built `dist/`, so run `npm run build` first (§1 covers it).

---

## 5. Desktop packaging

A packaging failure is invisible to every other check in this list: `electron-builder`'s `files`
list is an allowlist, so a main-process import that is not listed produces a build that succeeds
and an app that dies at launch with `ERR_MODULE_NOT_FOUND`.

```bash
npm run package:dir                       # unpacked build → release/linux-unpacked/
node scripts/check-packaged-imports.mjs   # every root module main imports is in the asar
```

`check-packaged-imports.mjs` derives the list from the imports themselves rather than a hardcoded
set, so it keeps working as the main process grows. It must print `All N root modules are
packaged.` A `✗` line means `electron-builder.yml` is wrong — fix the `files` list, not the import.

Then confirm the packaged binary actually launches, against a throwaway data directory so the
check cannot touch a real vault:

```bash
MCP_SLEUTH_DATA_DIR=$(mktemp -d) xvfb-run -a ./release/linux-unpacked/mcp-sleuth &
sleep 6
```

Expect no crash and nothing resembling `Cannot find module` on stderr. Kill it afterwards.

Confirm the npm package is unaffected — this is the load-bearing check for CLI users:

```bash
npm pack --dry-run 2>&1 | grep -E "electron"      # must print nothing
node -e "if (require('./package.json').main) throw new Error('main must stay unset')"
```

`files` in `package.json` is an allowlist too, so no Electron file should appear in the tarball,
and `main` must stay unset or `require('@orenvill/mcp-sleuth')` would boot an Electron window.

Full installers (`npm run package:linux`, or the 3-OS matrix in CI) are not required locally —
the release workflow builds them. Run them locally only when debugging a CI packaging failure.

---

## 6. CHANGELOG and version

> **Note:** `CHANGELOG.md` and the `version` field in `package.json` are managed automatically by release-please after the agent approves the release PR. You do not need to edit them manually — just confirm they look correct before approving.

- Open `CHANGELOG.md` — confirm the top section matches the version being released and lists all merged PRs/commits since the last tag.
- Open `package.json` — confirm `"version"` matches.
- Confirm `README.md` (GitHub version) and `README.npm.md` (npm version) reflect any new commands or features in this release.

---

## 7. Final gate

All of the above pass → merge the release-please PR. The GitHub Action will:
1. Tag the commit (`vX.Y.Z`)
2. Create a GitHub Release with the changelog section
3. Run `npm publish` (which fires `prepublishOnly` → swaps README → publishes → `postpublish` → restores README)
4. Run the `desktop` job — a macOS / Windows / Linux matrix that packages the app and uploads the installers to the same tag

After the Action completes, verify:
- `https://www.npmjs.com/package/@orenvill/mcp-sleuth` shows the new version, and the README displayed is the npm-focused one (starts with install instructions, not the Layout section).
- In a clean shell: `npm install -g @orenvill/mcp-sleuth@latest` → `mcp-sleuth` → confirms it opens the browser correctly.
- The GitHub Release carries installers from all three platforms: `Sleuth-<version>-arm64.dmg` and `-x64.dmg` plus the matching `.zip`s, `Sleuth-<version>-x64.exe`, and `Sleuth-<version>-x64.AppImage` / `.deb`. The matrix uses `fail-fast: false`, so a missing platform means that one job failed while the others succeeded — check the run before announcing the release.

The installers are unsigned and there is no auto-update, so users must be told to download manually. Confirm `README.md` still carries the unsigned-install click-through steps for all three platforms — a release that drops them turns into a bug report.
