# Desktop Update Notifier — Design

**Date:** 2026-08-21
**Status:** Approved, pending implementation

## Goal

Tell the user when a newer Sleuth has been released, and give them a one-click route to it.
Today the desktop app never mentions updates at all, so a user who installed 1.0.1 stays on
1.0.1 until they happen to revisit the GitHub releases page.

## The constraint that shapes everything

The builds are unsigned. This project has no Apple Developer certificate and no Windows
code-signing certificate, and `README.md` already documents the consequence: `electron-updater`
on macOS goes through Squirrel.Mac, which refuses to apply an update to an app without a valid
signature.

So this design deliberately stops at **notify**. It does not download, does not verify, and does
not install. Installing stays manual — download the installer, click through the OS warning,
install over the old copy — exactly as it works today.

That is not a workaround to be embarrassed about; it is the honest surface for an unsigned app.
The alternative is pretending to auto-update and silently failing on macOS.

## Non-goals

- Downloading the installer in-app, with or without checksum verification.
- `electron-updater`, `latest*.yml`, or any electron-builder publish provider.
- Code signing or notarization. Unchanged, and still the blocker for real auto-update.
- Any update notice in the browser / CLI build. `npm i -g @orenvill/mcp-sleuth@latest` remains
  how the CLI updates, as `README.npm.md` documents.
- Delta updates, update channels, rollback, telemetry of any kind.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Scope | Notify + open the release page | Only option that works on all five artifact types unsigned |
| Cadence | Once ~5s after launch, then every 6h | Catches long-running sessions without hammering the API |
| Opt-out | Yes — a persisted `autoCheck` flag | A tool for inspecting untrusted servers must not phone home unstoppably |
| Surface | Banner under the header, collapsing to a header badge | Noticed once, then quiet but rediscoverable |
| Download target | The release page, always | Linux ships deb *and* AppImage; the app cannot know which was installed |
| Controls | A version pill in the header | The menu bar is auto-hidden on Windows and Linux, so a Help item would be invisible there |
| Build scope | Desktop only, via a `Host.updates` group | Keeps the seam rule; no `isDesktop` branch reaches the UI |

## Architecture

Four units under `electron/update/`, each with one job, each dependency-injected so it tests
without launching Electron — the same discipline as `electron/windowState.js`.

```
electron/update/
  version.js   compareVersions(a, b) -> -1 | 0 | 1
               Pure. Tolerates a leading `v`. Ranks a prerelease below its release
               (1.2.0-rc.1 < 1.2.0). No semver dependency.

  feed.js      fetchLatestRelease({ fetch, url, signal })
               -> { version, name, notes, url, publishedAt }
               Parses the GitHub /releases/latest payload. Injected fetch, so the
               tests never touch the network.

  store.js     Reads and writes update-state.json. Injected fs. A pure `normalise()`
               so a corrupt or partial file is unit-testable.

  service.js   The orchestrator: the 5s kickoff, the 6h timer, the autoCheck flag,
               and the skipped/dismissed logic. Injected clock and deps.
               It decides *whether the renderer should be told*, which keeps the
               UI free of policy.

electron/ipc/updateHandlers.js
               Envelope handlers, registered from main.js like the other three groups.
```

`electron/main.js` gains roughly six lines: build the service after the stores exist, register
the handlers, start it once the window has loaded. `electron-builder.yml` needs no change —
`electron/**` and `data-dir.js` are already in the `files` allowlist.

### State

`<data dir>/update-state.json`, beside `window-state.json`:

```json
{
  "autoCheck": true,
  "skippedVersion": null,
  "dismissedVersion": "1.2.0",
  "lastCheckedAt": 1755780000000
}
```

Not the vault — there is no secret here. Not `data.gz` — that is renderer-owned app data, and
the check has to work before the vault is unlocked.

Add a row to the persistence table in `CLAUDE.md`.

### The seam

`Host` gains a fourth capability group. Per the rule in `CLAUDE.md`, a host method must be
implementable on both sides, and this one is: the browser implementation is inert.

```ts
export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  /** true when the banner should show: an update exists and was never dismissed or skipped. */
  showBanner: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
  autoCheck: boolean;
  lastCheckedAt: number | null;
  lastError: string | null;
}

export interface UpdateHost {
  /** null when this build has no update channel — the browser build. */
  getStatus(): Promise<UpdateStatus | null>;
  /** A user-initiated check. Surfaces its failure in `lastError`. */
  check(): Promise<UpdateStatus | null>;
  setAutoCheck(enabled: boolean): Promise<void>;
  /** Never mention this version again, banner or badge. */
  skip(version: string): Promise<void>;
  /** Collapse the banner to the badge, permanently, for this version. */
  dismiss(version: string): Promise<void>;
  openRelease(): Promise<void>;
  onUpdateAvailable(handler: (status: UpdateStatus) => void): () => void;
}
```

`src/lib/host/browser/updatesBrowser.ts` resolves `null` from `getStatus` and `check`, no-ops
the mutators, and returns a no-op unsubscribe. The renderer therefore renders neither pill nor
banner in the browser build without ever asking what platform it is on.

`openRelease` routes through the existing `openExternalUrl` in `electron/externalLinks.js`,
which already restricts schemes to http(s) and handles WSL's broken `xdg-open`.

## Data flow

```
app ready -> window loaded -> 5s -> service.check()
                                      |
                                      |  GET api.github.com/repos/OrenVill/mcp-sleuth/releases/latest
                                      |  Electron net.fetch, no auth, User-Agent only, 10s timeout
                                      v
                              compareVersions(latest, app.getVersion())
                                      |
                    <= current --------+-------- > current
                         |                          |
                   status: up to date        skipped? dismissed?
                         |                          |
                         v                          v
                   pill reads "v1.0.1"     banner (first sight) -> badge "^1.2.0"
                                           push on mcp:updateAvailable

                 then every 6h while autoCheck is true
```

`/releases/latest` excludes drafts and prereleases by default. That matters: it means a version
is only ever announced once its GitHub Release exists, which in `release.yml` is after
`release-please` has cut the tag — the installers upload to that same release moments later.

**Failure is silent on automatic checks.** Log to the main console, leave the pill alone. A
*manual* check surfaces the failure inline in the popover ("Couldn't reach GitHub"), because the
user asked and deserves an answer.

**Testability hook:** the feed URL comes from `MCP_SLEUTH_UPDATE_FEED_URL` when set, otherwise
the GitHub API. This is what the Playwright Electron spec points at a fixture, what the manual
demo uses, and incidentally an escape hatch for a fork.

## UI

Three renderer files. `App.tsx` grows by about four lines and owns no update state — the rule
that it must not grow holds.

| File | Job |
|---|---|
| `src/components/useUpdateStatus.ts` | Hook: initial `getStatus`, subscribe to the push, expose the actions. Mirrors `useProtocolTraces.ts`. |
| `src/components/VersionPill.tsx` | The `v1.0.1` label plus its popover: current version, Check now, and the auto-check checkbox. Becomes a violet `^1.2.0` when an update exists. |
| `src/components/UpdateBanner.tsx` | The strip under `<header>`. "What's new" expands the release notes through the existing `MarkdownPreview`, capped at ~2 KB. |

Both render nothing when `getStatus` resolved `null`.

### Semantics

- **Download** — opens the release page; the banner collapses to the badge.
- **Later / X** — `dismiss(version)`. The banner never returns *for that version*; the badge
  stays as the reminder. A newer version brings the banner back.
- **Skip** — `skip(version)`. Banner and badge both hidden until something newer than the
  skipped version ships.
- **Auto-check off** — no launch check, no timer. The pill stays a plain `v1.0.1` and
  "Check now" still works.

The release notes come from our own repository, but they are still remote text rendered in the
app. They go through `MarkdownPreview`, the same component that already renders untrusted MCP
server content, and are length-capped.

## Privacy

One unauthenticated GET to `api.github.com` per check. No identifiers, no app state, no
telemetry — a User-Agent and nothing else. GitHub sees the IP, as it would for any request.
`autoCheck: false` stops it completely. `README.md` states this plainly.

## Tests

TDD, unit tests first.

- `electron/update/version.test.js` — ordering, `v` prefix, prerelease ranking, malformed input.
- `electron/update/feed.test.js` — parses a captured payload; handles 404, a rate-limit body,
  and a timeout.
- `electron/update/store.test.js` — defaults, corrupt JSON, round-trip.
- `electron/update/service.test.js` — the decision table: a skipped version stays silent, a
  dismissed version yields badge-not-banner, `autoCheck: false` fires nothing, the 6h timer
  ticks against an injected clock.
- `src/lib/host/browser/updatesBrowser.test.ts` — every method inert, `getStatus` is `null`.

End to end, per the release gate in `CLAUDE.md`:

- `tests/electron/07-updates.spec.ts` — launch with `MCP_SLEUTH_UPDATE_FEED_URL` pointed at a
  fixture serving a newer release. Assert the banner appears, Skip persists into
  `update-state.json`, and the pill shows the current version when the feed says up to date.
- `tests/release/25-update-notifier.spec.ts` — the negative case: the browser build renders
  neither banner nor pill.

## Docs

- `README.md` — replace "There is no auto-update" with "Update notifications": what is checked,
  how often, what is sent, how to switch it off, and that installing stays manual. The signing
  explanation stays; it is still true and still the reason.
- `.cursor/skills/prepare-for-release/SKILL.md` — add section 3.25, describe the manual pass,
  update the test counts.
- `CLAUDE.md` — `electron/update/` in the tree, the `updates` group in the Host seam section,
  `update-state.json` in the persistence table.

## Manual verification

`scripts/fake-release-feed.mjs` serves a `/releases/latest` payload announcing a version above
the installed one. Run the desktop app against it to see the real banner, badge, and popover:

```bash
node scripts/fake-release-feed.mjs &          # serves the fake release on 127.0.0.1:4599
MCP_SLEUTH_UPDATE_FEED_URL=http://127.0.0.1:4599/releases/latest npm run electron:start
```

Dev dependency `nodemon` plus `npm run electron:watch` restarts the main process on edit while
working on this.

## Alternatives considered

**Full `electron-updater`.** Rejected for now: macOS requires a signed and notarized app, so it
would work on Windows NSIS and the Linux AppImage but silently fail for macOS users and never
work for deb. Three of five artifacts is worse than an honest notifier on all five. If a
certificate is ever bought, `Host.updates` is the seam it slots behind — the banner becomes
"Restart to update" and the service gains a download step.

**In-app download with checksum verification.** Rejected as scope: it needs checksums published
in `release.yml`, a progress UI, and cancellation, and still ends at the same OS installer and
the same unsigned-app warning. The user's hands do the same work either way.

**Direct per-platform asset links.** Rejected: Linux ships both a deb and an AppImage and the
app cannot know which is installed, and asset-name matching rots silently if `artifactName` in
`electron-builder.yml` ever changes.

**Help-menu-only controls.** Rejected: `autoHideMenuBar` hides the menu on Windows and Linux, so
most users would never find it.
