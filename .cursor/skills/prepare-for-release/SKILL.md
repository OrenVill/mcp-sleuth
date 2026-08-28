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
npm test             # vitest run — 725 tests
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
MCP fixture on `127.0.0.1:3001` (`tests/fixtures/http-mcp-server.mjs`), plus the scripted
OpenAI-compatible LLM fixture on `127.0.0.1:3003` (`tests/fixtures/llm-server.mjs`) that §3.26
needs. No manual setup is needed. To run either fixture on its own while debugging:

```bash
node tests/fixtures/http-mcp-server.mjs
node tests/fixtures/llm-server.mjs
```

Run the full automated release suite:

```bash
npx playwright test tests/release/
```

All 124 tests across 26 spec files must pass. Any failure blocks the release.

Two specs additionally connect to an external MCP server on the LAN
(`AWESOME_URL` in `tests/release/helpers.ts`): §3.6 (boolean-param tool) and §3.12
(meta-tool discovery). If that host is unreachable those two specs fail — check it
before assuming a regression.

The suite covers §3.1–3.26 of the release spec: initial load, server add/error, tab bar,
fixture connection, tool forms, result pane rendering, call history diff, bookmarks
persistence, cross-server search, export dialog, meta-tool discovery, resources tab,
prompts tab, Protocol Inspector, Replay Suites, Schema Lab, Agent Readiness, Client
Config Export, Handoff README, Scenario Runner, stdio transport (local bridge + echo
tool), Trust evaluators (Permission Surface, Prompt Injection scan, Observation
Journal), error handling, the absence of the desktop update notice, and Agent Chat.

**Fixture content is load-bearing.** `http-mcp-server.mjs` documents which spec depends
on each tool, resource, and prompt it registers — read that header before changing it.
In particular no name or description may contain the word "fixture", because
`helpers.ts` locates the server row with a case-insensitive `hasText: 'Fixture'` match.

**§3.22 — Stdio transport (manual pass):** Add a stdio server with command `node` (or `process.execPath`) and args pointing at `tests/fixtures/stdio-mcp-server.mjs`; confirm the sidebar shows connected (green dot), the `echo` tool appears, invoking with a message returns that text in the result pane, and disconnect/reconnect still works. Automated: `tests/release/22-stdio-transport.spec.ts` (no HTTP fixture server required).

**§3.23 — Trust evaluators (manual pass):** With the fixture server connected, open Dev Tools and
check each of the three tabs renders for that server: **Permission Surface** (a per-category risk
summary, not a pass/fail score), **Prompt Injection** (findings with the matched text highlighted),
**Observation Journal** (add a note, set an approve/reject decision, export Markdown). A tab that
renders empty or throws for a connected server blocks release. Automated:
`tests/release/23-trust-evaluators.spec.ts`.

**§3.25 — Update notifier, browser build (manual pass):** Load the browser build and confirm there
is no version pill beside the app name and no update banner under the header, and that no request
to `api.github.com` appears in the network tab. The browser and CLI builds update through npm and
must not acquire a desktop-only surface. Automated:
`tests/release/25-update-notifier.spec.ts`.

**§3.26 — Agent Chat (manual pass):** This one needs a real model, because the automated spec
drives a scripted fixture that always picks the same tool. Point it at a local model — Ollama with
any tool-capable model is enough, and needs no key:

```bash
ollama serve            # then: ollama pull <a tool-capable model>
npm run dev             # or: mcp-sleuth
```

With the fixture server (or any real server) connected, click **Chat** in the toolbar, add an LLM
server (Type *OpenAI-compatible*, Base URL `http://127.0.0.1:11434/v1`, no API key), and confirm
Sleuth lists that server's models rather than leaving the model box empty. Then, in order:

1. **The header status line reads the state correctly** — "N tools exposed" once a model and at
   least one server are selected; "No model selected" / "No connected MCP server" / "No server in
   scope" otherwise, with the composer disabled in each of those cases.
2. **Ask something that needs a tool.** An approval card appears before anything runs, naming the
   tool and showing the exact arguments. Nothing reaches the server until you click.
3. **Allow** it. The call appears in the live trace with a duration, in the Protocol Inspector,
   and the model answers from the result.
4. **Deny** a call with **Wrong tool**. The run must *continue* — the model gets the reason back
   and adapts. A denial that aborts the run is a regression, not a UI nicety.
5. **A risk-locked tool asks every time.** Pick a tool the Permission Surface audit tags
   destructive, shell, credential, or admin: the card shows the risk-locked badge and offers no
   "always allow". Being able to session-allowlist such a tool blocks release.
6. **Capture** the run as a replay suite, then open Dev Tools → Replay Suites and confirm it is
   there with the run's successful calls. **Record** a tool step and confirm it lands in that
   server's Observation Journal.
7. **Agent Readiness** for that server now lists the deny reasons as issues (wrong tool picked /
   unusable arguments), on top of the schema heuristics.
8. **Close and reopen the overlay.** The transcript must be gone. **Transcripts are never
   persisted** — only the counters in `<data dir>/data.gz` under `agentRuns`. A transcript that
   survives a reopen, or any message text found in `data.gz`, blocks release.
9. **Credentials.** An API key entered here must appear only inside the encrypted `vault.json`.
   Grep the data directory for it: a hit outside the ciphertext blocks release.
10. **Failure surfaces, not silence.** Stop the model server mid-run and send again: the error is
    shown inline in the transcript and the app stays usable.
11. **The run never looks frozen.** From the moment you send until the run ends, something on
    screen says the agent is working — the bouncing dots while it waits on the model or a tool,
    the caret while text streams. The one exception is an open approval card: that is your turn,
    so the dots must be gone. Dots still bouncing after the answer lands is a defect.
12. **Typing during a run does not lose the message.** Send something, and while it is still
    running type a second message and press Enter. It must appear queued above the composer and
    send itself once the run ends — never vanish. Shift+Enter must add a line instead of sending,
    and the composer must grow with the text.
13. **The keyboard reaches the gate without arming it.** When an approval card appears, focus is
    on the card and Enter does *nothing*; one Tab reaches **Allow**, and Enter there approves.
    Enter approving straight from the composer blocks release — it is the same class of defect as
    a call that runs without a card.
14. **Escape respects what is open.** With the model picker open, Escape closes only the picker.
    With an approval card open, Escape does nothing. Otherwise it closes the chat.
15. **Recovery and housekeeping.** Stop the model server mid-run to force an error, then
    **Retry** — the turn re-runs from the existing history and the prompt is not duplicated as a
    second user message. **New chat** clears the conversation in place. Scroll up mid-run and
    **Jump to latest** returns you to the bottom. Copy an assistant message and confirm you get
    the markdown source rather than the rendered text; a tool result longer than its box offers
    **Show full result**.

**Release blockers, in priority order:** a tool call that runs without an approval card; a
risk-locked tool that can be session-allowlisted; a denial that aborts the run instead of
feeding the reason back; transcript text found on disk; an API key found anywhere outside the
vault ciphertext. Everything else in the list is a defect to file, not a stop.

Automated: `tests/release/26-agent-chat.spec.ts`, against `tests/fixtures/llm-server.mjs` — it
covers the header readiness line, the gate appearing before the call runs, allow, deny with a
reason and the run continuing, the live trace, replay capture, the working indicator across every
gap in a run, Enter/Shift+Enter in the composer, queueing a message typed mid-run, the expander on
a long tool result, jump-to-latest, New chat, Escape against an open picker, Retry after a failed
turn, Stop leaving the run cancelled but retryable, the approval card taking focus without arming
Enter, copying an assistant message as markdown source, the MCP scope popover, and the disabled
composer. Steps 5, 7, 8, 9, and 10 above
are the manual-only ones.

> Spec numbers map to the `§3.N` sections above. The next spec added should be `27`.

---

## 4. Electron E2E suite

The desktop app is a second shipped artefact and the browser suite does not exercise it: the
transport, the persistence path, and the window chrome are all different code.

```bash
npm run test:e2e:electron          # needs a display
xvfb-run -a npm run test:e2e:electron   # headless machine / CI
```

All 49 tests across 8 spec files must pass:

| Spec | Area |
|------|------|
| `01-launch.spec.ts` | Launch and security posture |
| `02-http-direct.spec.ts` | HTTP transport straight from the main process — no proxy |
| `03-stdio-direct.spec.ts` | Stdio spawned as a child process — no HTTP bridge |
| `04-native-persistence.spec.ts` | Vault and app-data files land in the data directory |
| `05-app-chrome.spec.ts` | Frameless window, title bar, window controls, menu |
| `06-dialogs.spec.ts` | In-app dialogs — vault reset confirm/cancel/Escape, no browser chrome |
| `07-updates.spec.ts` | Update notifications — banner, badge, skip/dismiss, opt-out, failed check |
| `08-agent-chat.spec.ts` | Agent Chat — provider requests leave the main process directly, no `/__llm_proxy` |

**Agent Chat egress (manual pass).** The desktop build has no proxy in the path, so this is a
different code path from §3.26, not a repeat of it. With a local model running, open **Chat**, add
the LLM server, and confirm a run completes. Then confirm the request left the main process: no
request to `/__llm_proxy` appears in the renderer's network panel, and the app:// origin never
talks to the provider host directly. Automated: `tests/electron/08-agent-chat.spec.ts`.

**Update notifier (manual pass).** The automated spec drives a local fake feed; do this once by
hand before a release, because it is the path real users take:

```bash
node scripts/fake-release-feed.mjs &
MCP_SLEUTH_UPDATE_FEED_URL=http://127.0.0.1:4599/releases/latest npm run electron:start
```

Confirm, in order: the banner appears within ~10s of unlocking the vault and names the announced
version and the installed one; **What's new** expands the release notes; **Later** collapses it to
a violet `↑` badge in the header that survives a restart while the banner does not; **Skip** hides
both; the version pill's popover offers **Check now** and the auto-check switch, and unchecking it
writes `autoCheck: false` to `<data dir>/update-state.json`. Then run it with `--fail 403` and
confirm a background check stays silent while **Check now** reports the rate limit.

**A release with no installers must stay silent.** `release.yml` publishes the GitHub Release
about ten minutes before the three-OS matrix finishes uploading installers. Sleuth refuses to
announce a release until at least one installer is attached, so nobody is sent to an empty release
page. Check it with `node scripts/fake-release-feed.mjs --building`: no banner, and **Check now**
says the release is still being built. **After cutting a real release, confirm the installers
actually uploaded** — a matrix that fails on all three platforms leaves a release no one is ever
told about, which is the correct behaviour but still a release to fix.

**Download must open the browser, not install anything.** The builds are unsigned; if a release
ever adds an in-app download or `electron-updater`, that is a signing decision, not a UI one.

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
