# Electron Packaging, CI & Docs (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce downloadable desktop installers for macOS, Windows, and Linux from CI, without disturbing the `npx @orenvill/mcp-explorer` CLI, and bring the docs in line.

**Architecture:** `electron-builder` packages `dist/` plus the `electron/` tree and the three root modules the main process imports. A `desktop` job in the existing `release.yml` runs a 3-OS matrix gated on release-please, uploading to the same tag. Builds are unsigned.

**Tech Stack:** electron-builder 26, GitHub Actions, existing release-please setup.

**Depends on:** Phases 1, 2a, and 2b — all complete and merged.

**Source spec:** `docs/superpowers/specs/2026-08-20-electron-desktop-app-design.md`

---

## Verified facts

Checked against the working tree — do not re-derive.

- `electron/main.js` imports `../vault-file-handler.js`, `../app-data-handler.js`, and
  `../daemon-lock.js`; `electron/windowState.js` imports `../app-data-handler.js`.
  **All three root modules must be in the packaged `files` list** or the app dies at
  startup. This is the single most likely packaging failure.
- `package.json` has **no `main` field**, and it must stay that way: the published npm
  package is a CLI (`bin`), and pointing `main` at `electron/main.js` would make
  `require('@orenvill/mcp-explorer')` boot an Electron app. Inject the entry with
  electron-builder's `extraMetadata.main` instead, which only affects the packaged
  app's metadata.
- Runtime `dependencies` are `@modelcontextprotocol/sdk` and `marked`. The SDK is used
  by the **main process** and must reach the asar. `marked` is renderer-only and is
  already bundled into `dist/` by Vite.
- `npm install` on this machine did **not** fetch the Electron binary — `path.txt` was
  empty and `dist/` was missing until `node install.js` was run inside
  `node_modules/electron`. Expect the same on CI runners.
- `eslint.config.js` scopes to `**/*.{ts,tsx}`, so nothing under `electron/` is linted
  today. Same treatment as `server.js`/`proxy.js`, but the `electron/` tree is now the
  largest body of unlinted code in the repo.
- `release.yml` already exposes `release_created` and `tag_name` from release-please and
  has an `upload-artifact` job that publishes to npm.
- Current version is `0.8.1`, managed by release-please. Do not hand-edit it.

---

## File Structure

**Created:**

| File | Responsibility |
|------|---------------|
| `electron-builder.yml` | Packaging config: appId, files, targets, output directory. |
| `build/entitlements.mac.plist` | macOS hardened-runtime entitlements (needed even unsigned, for a valid app bundle). |

**Modified:**

| File | Change |
|------|--------|
| `package.json` | `electron-builder` devDependency; `package:*` scripts. No `main` field. |
| `eslint.config.js` | Lint `electron/**/*.js` and the root Node modules. |
| `.github/workflows/release.yml` | `desktop` job: 3-OS matrix, gated on `release_created`, uploads to `tag_name`. |
| `.github/workflows/build.yml` | PR-time `--dir` Electron build so packaging breaks surface before a tag. |
| `README.md` | Desktop download section, unsigned-install instructions, dev commands. |
| `README.npm.md` | Point CLI users at the desktop app. |
| `CLAUDE.md` | `electron/` tree in the architecture map; fix the stale spec table. |
| `.cursor/skills/prepare-for-release/SKILL.md` | Desktop packaging checks in the release gate. |

**Not touched:** anything under `src/`, `electron/`, or `tests/` — Phase 3 changes no application behaviour.

---

## Task 1: electron-builder config

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`
- Create: `build/entitlements.mac.plist`

- [ ] **Step 1: Install electron-builder**

Run: `npm install --save-dev electron-builder@26`

Verify it landed in devDependencies only:

Run: `node -e "const p=require('./package.json'); console.log('dev:', !!p.devDependencies['electron-builder'], 'prod:', !!p.dependencies['electron-builder'], 'main:', p.main ?? '(unset)')"`
Expected: `dev: true prod: false main: (unset)`

If `main` is now set, remove it — see the verified facts above.

- [ ] **Step 2: Write the builder config**

Create `electron-builder.yml`:

```yaml
appId: com.orenvill.mcp-explorer
productName: MCP Explorer
copyright: MIT

directories:
  output: release
  buildResources: build

# `main` is injected only into the packaged app. The published npm package must
# keep no `main` field — it is a CLI, and a `main` pointing at electron/main.js
# would make `require('@orenvill/mcp-explorer')` boot an Electron window.
extraMetadata:
  main: electron/main.js

# electron/main.js and electron/windowState.js import these three root modules.
# Omitting any of them produces an app that installs cleanly and then crashes on
# launch, which is the failure this list exists to prevent.
files:
  - dist/**
  - electron/**
  - vault-file-handler.js
  - app-data-handler.js
  - daemon-lock.js
  - package.json
  - '!**/*.test.js'
  - '!**/*.map'

mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

win:
  target:
    - target: nsis
      arch: [x64]

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false

linux:
  category: Development
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
```

- [ ] **Step 3: macOS entitlements**

Create `build/entitlements.mac.plist`. `hardenedRuntime` requires this file even
without signing, and JIT/unsigned-memory entitlements are what let Chromium run:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
  </dict>
</plist>
```

`network.client` is required: the main process makes the MCP HTTP requests.

- [ ] **Step 4: Add the scripts**

Add to `package.json` `scripts`, leaving every existing entry untouched:

```json
    "package": "npm run build && electron-builder --publish never",
    "package:dir": "npm run build && electron-builder --dir --publish never",
    "package:linux": "npm run build && electron-builder --linux --publish never",
```

- [ ] **Step 5: Ignore the output**

`.gitignore` already contains `/release/` from Phase 2a. Confirm:

Run: `grep -n "release" .gitignore`
Expected: a `/release/` line. Add it if missing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron-builder.yml build/ .gitignore
git commit -m "build(electron): add electron-builder configuration"
```

---

## Task 2: Prove a package actually runs

A config that produces a file is not a config that produces a working app. The
three root-module imports make a silent runtime failure the likely outcome.

**Files:** none modified.

- [ ] **Step 1: Build an unpacked directory**

Run: `npm run package:dir`
Expected: completes; `release/linux-unpacked/` exists.

If electron-builder reports a missing Electron binary, run
`node node_modules/electron/install.js` first — see the verified facts.

- [ ] **Step 2: Confirm the root modules were packaged**

Run: `ls release/linux-unpacked/resources/app.asar >/dev/null && npx asar list release/linux-unpacked/resources/app.asar | grep -E "vault-file-handler|app-data-handler|daemon-lock|electron/main.js"`
Expected: all four paths listed.

If `app.asar` does not exist the build used an unpacked `app/` directory; list that
instead. Either way, **all three root modules must be present**.

- [ ] **Step 3: Launch the packaged app and prove it works**

The binary is `release/linux-unpacked/mcp-explorer` (or `MCP Explorer`). Launch it
against a throwaway data directory and confirm it reaches the vault screen:

```bash
MCP_EXPLORER_DATA_DIR=$(mktemp -d) xvfb-run -a ./release/linux-unpacked/*mcp-explorer* &
sleep 6
```

Expected: no crash, no `Cannot find module` on stderr. Kill it afterwards.

A `Cannot find module '../app-data-handler.js'` here means the `files` list is wrong —
fix `electron-builder.yml`, not the import.

- [ ] **Step 4: Build a real installer**

Run: `npm run package:linux`
Expected: `release/` contains an `.AppImage` and a `.deb`.

Run: `ls -la release/*.AppImage release/*.deb`
Expected: both present and non-trivial in size (>50 MB).

- [ ] **Step 5: Commit**

Nothing to commit if the config was already correct. If `electron-builder.yml`
needed fixing:

```bash
git add electron-builder.yml
git commit -m "fix(electron): package the root modules the main process imports"
```

---

## Task 3: Lint the Electron tree

Carried finding from Phase 2a: `electron/**/*.js` is entirely unlinted.

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Read the current config**

Run: `cat eslint.config.js`

Note the existing block scoped to `**/*.{ts,tsx}` and its ignore list.

- [ ] **Step 2: Add a Node-JS block**

Add a second config block covering `electron/**/*.js` and the root Node modules
(`server.js`, `proxy.js`, `stdio-bridge.js`, `vault-file-handler.js`,
`app-data-handler.js`, `daemon-lock.js`, `bin/*.js`), using
`js.configs.recommended` with Node globals. Do not enable type-aware rules — these
files are plain ESM with no TypeScript project.

- [ ] **Step 3: Run it and fix what it finds**

Run: `npm run lint`
Expected: passes. If it reports genuine problems in existing files, fix them; if a
rule is inappropriate for this code (for example `no-empty` on deliberate
best-effort catch blocks), disable that rule for this block with a comment
explaining why rather than editing every call site.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js electron/ *.js bin/
git commit -m "chore(lint): cover the Electron tree and root Node modules"
```

---

## Task 4: CI — desktop builds on release

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Read the existing workflow**

Run: `cat .github/workflows/release.yml`

Note that `release-please` outputs `release_created` and `tag_name`, and that
`upload-artifact` already depends on it and publishes to npm.

- [ ] **Step 2: Add the desktop job**

Add a `desktop` job alongside `upload-artifact`:

```yaml
  desktop:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      # npm ci does not reliably fetch the Electron binary; without this the
      # build fails with an empty path.txt.
      - run: node node_modules/electron/install.js

      - run: npm run build

      - name: Package
        run: npx electron-builder --publish never

      - name: Upload installers to the release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        shell: bash
        run: |
          shopt -s nullglob
          files=(release/*.dmg release/*.zip release/*.exe release/*.AppImage release/*.deb)
          if [ ${#files[@]} -eq 0 ]; then
            echo "no installers produced" >&2
            exit 1
          fi
          gh release upload "${{ needs.release-please.outputs.tag_name }}" "${files[@]}" --clobber
```

`fail-fast: false` so one platform's failure still yields the other two.
The empty-glob guard turns "silently uploaded nothing" into a visible failure.

- [ ] **Step 3: Validate the YAML**

Run: `python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/release.yml')); print(sorted(d['jobs']))"`
Expected: includes `desktop`, `release-please`, and `upload-artifact`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build and upload desktop installers on release"
```

---

## Task 5: CI — catch packaging breaks on PRs

A packaging failure that only appears at tag time blocks a release. A `--dir`
build is much cheaper than full installers and catches the common breakages.

**Files:**
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add an electron job**

Add alongside the existing `test-lint` job:

```yaml
  electron:
    name: electron package check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: node node_modules/electron/install.js

      - run: npm run build

      # --dir skips installer generation: enough to catch a bad files list or a
      # missing module, without paying for dmg/nsis/AppImage on every PR.
      - run: npx electron-builder --dir --publish never

      - name: Confirm the root modules were packaged
        run: |
          test -d release/linux-unpacked
          npx asar list release/linux-unpacked/resources/app.asar | grep -q 'app-data-handler.js'
          npx asar list release/linux-unpacked/resources/app.asar | grep -q 'vault-file-handler.js'
          npx asar list release/linux-unpacked/resources/app.asar | grep -q 'daemon-lock.js'
```

That last step is the real value: it fails loudly if someone adds an import that
is not in the `files` list.

- [ ] **Step 2: Validate and commit**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/build.yml')); print(sorted(d['jobs']))"`
Expected: includes `electron` and `test-lint`.

```bash
git add .github/workflows/build.yml
git commit -m "ci: check Electron packaging on pull requests"
```

---

## Task 6: Documentation

**Files:**
- Modify: `README.md`, `README.npm.md`, `CLAUDE.md`,
  `.cursor/skills/prepare-for-release/SKILL.md`

- [ ] **Step 1: README.md — desktop section**

Add a Desktop app section near the top of the install instructions covering:
- where to download (GitHub releases for the current tag),
- **the unsigned-install steps**, which users will otherwise report as bugs:
  - macOS: System Settings → Privacy & Security → **Open Anyway**. The
    right-click-to-Open trick is unreliable on current macOS.
  - Windows: SmartScreen → More info → Run anyway.
  - Linux: `chmod +x` the AppImage.
- **that there is no auto-update** — `electron-updater` on macOS requires signing,
  so updates are manual downloads.
- dev commands: `npm run electron:dev` (with `npm run dev` alongside for hot
  reload) and `npm run electron:start`.
- that desktop and CLI share `~/.mcp-explorer/`, so running both at once is
  last-write-wins.

- [ ] **Step 2: README.npm.md — point CLI users at the app**

A short section noting the desktop app exists, what it adds (no CORS proxy, stdio
spawned directly, OS keychain unlock where available, native save dialogs), and
that the CLI remains fully supported — it is the only option for remote/SSH use.

- [ ] **Step 3: CLAUDE.md — architecture and the stale table**

- Add the `electron/` tree to the architecture map: `main.js`, `window.js`,
  `preload.cjs`, `protocol.js`, `windowState.js`, `menu.js`, `externalLinks.js`,
  `ipc/`, `mcp/`, `secrets/`, `appdata/`.
- Add `src/lib/host/` and explain the seam in one or two sentences: `mcpClient.ts`
  keeps tracing and delegates transport to a host, so the SDK runs in the renderer
  for the browser build and in the Electron main process for the desktop build.
- Add `stdio-bridge.js` to the server-side boundary table — it is missing.
- **Fix the spec table**: it stops at `21`, but `tests/release/` has 23 files, and
  `22-stdio-transport.spec.ts` / `22-trust-evaluators.spec.ts` share a number.
  Renumber one to `23` and list them all, plus `tests/electron/`.

- [ ] **Step 4: SKILL.md — release gate**

Add a desktop packaging section: run `npm run package:dir`, confirm the app
launches, and confirm the three root modules are in the asar. Note that the
Electron E2E suite (`npm run test:e2e:electron`) is part of the gate and how many
tests it has. Keep the existing browser-suite section accurate.

- [ ] **Step 5: Commit**

```bash
git add README.md README.npm.md CLAUDE.md .cursor/skills/prepare-for-release/SKILL.md
git commit -m "docs: cover the desktop app, packaging, and the release gate"
```

---

## Task 7: Full verification

- [ ] **Step 1: The npm package must be unchanged**

This is the load-bearing check for CLI users.

Run: `npm pack --dry-run 2>&1 | grep -E "electron|npm notice.*files" | head -20`
Expected: **no `electron/` entries and no `electron-builder.yml`**. `files` is an
allowlist, so nothing new should appear.

Run: `node -e "const p=require('./package.json'); if (p.main) throw new Error('main must stay unset'); if (p.dependencies.electron || p.dependencies['electron-builder']) throw new Error('electron must be a devDependency')"`
Expected: no output.

- [ ] **Step 2: All three suites**

```bash
npm run build && npm run lint && npm test
npx playwright test tests/release/
xvfb-run -a npx playwright test --config playwright.electron.config.ts
```

Expected: build and lint clean; unit suite green; 99/99 browser; the Electron suite green.

- [ ] **Step 3: The CLI still works**

Run: `node bin/mcp-explorer.js --no-open` then `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/`
Expected: `200`. Then `node bin/mcp-explorer.js stop`.

Nothing in this phase should have touched the CLI, and this proves it.

---

## Definition of done

- [ ] `npm run package:linux` produces a working AppImage and deb.
- [ ] The packaged app launches and reaches the vault screen.
- [ ] `vault-file-handler.js`, `app-data-handler.js`, and `daemon-lock.js` are in the asar.
- [ ] `npm pack --dry-run` shows no Electron files; `main` is still unset; `electron`
      and `electron-builder` are devDependencies only.
- [ ] `npm run lint` covers `electron/**/*.js` and passes.
- [ ] Both workflows are valid YAML with the new jobs present.
- [ ] All three test suites pass.
- [ ] `README.md` documents the unsigned-install steps and the absence of auto-update.
- [ ] `CLAUDE.md`'s spec table matches the files actually in `tests/release/`.

**Out of scope, deliberately:** code signing, notarization, and auto-update. They need
an Apple Developer account and a Windows certificate, and were an explicit
non-goal — see the spec's *Consequences of shipping unsigned*.
