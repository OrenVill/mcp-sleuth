# npm Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `mcp-explorer` to the npm registry as `@orenvill/mcp-explorer` with a pre-built `dist/`, OIDC trusted publishing, and automatic provenance attestations.

**Architecture:** Ship a pre-built `dist/` in the npm package so users get instant CLI startup with no build step. Move all build tools to `devDependencies`. The GitHub Actions release workflow builds `dist/`, uploads the GitHub Release artifact, and publishes to npm via OIDC (no stored token). The CLI bin script falls back to building from source only when `dist/` is absent (dev installs).

**Tech Stack:** Node.js ESM, Vite 8, GitHub Actions, npm OIDC trusted publishing

---

## File Map

| File | Change |
|---|---|
| `package.json` | Rename, add metadata, restructure deps, update `files` |
| `bin/mcp-explorer.js` | Skip build when `dist/index.html` already exists |
| `.github/workflows/release.yml` | Add OIDC permission + `registry-url` + `npm publish` step |

---

## Task 1: Add package identity and metadata to package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Apply metadata changes**

Open `package.json` and apply these changes:

```json
{
  "name": "@orenvill/mcp-explorer",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/OrenVill/mcp-explorer"
  },
  "homepage": "https://github.com/OrenVill/mcp-explorer",
  "keywords": ["mcp", "model-context-protocol", "developer-tools", "cli"],
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

Add these fields alongside the existing fields (keep `version`, `description`, `type`, `bin`, `files`, `scripts`, `dependencies`, `devDependencies`).

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass (no failures — these are metadata-only changes).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename to @orenvill/mcp-explorer and add npm metadata"
```

---

## Task 2: Restructure dependencies

Move build-time packages out of `dependencies` into `devDependencies`. This reduces the installed footprint from ~50MB to just `@modelcontextprotocol/sdk`.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Move packages**

In `package.json`, the `dependencies` section should become:

```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.29.0"
}
```

The `devDependencies` section should become (merging existing devDeps with the moved packages, removing `@rolldown/binding-linux-x64-gnu`):

```json
"devDependencies": {
  "@eslint/js": "^10.0.1",
  "@tailwindcss/vite": "^4.2.4",
  "@types/node": "^24.12.2",
  "@types/react": "^19.2.14",
  "@types/react-dom": "^19.2.3",
  "@vitejs/plugin-react": "^6.0.1",
  "eslint": "^10.2.1",
  "eslint-plugin-react-hooks": "^7.1.1",
  "eslint-plugin-react-refresh": "^0.5.2",
  "globals": "^17.5.0",
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "shiki": "^4.0.2",
  "tailwindcss": "^4.2.4",
  "typescript": "~6.0.2",
  "typescript-eslint": "^8.58.2",
  "vite": "^8.0.10",
  "vitest": "^4.1.5"
}
```

Note: `@rolldown/binding-linux-x64-gnu` moves to `devDependencies` (not dropped) — it is required for `vite build` to work on Linux x64. Pin it at `^1.0.2` to match the installed rolldown version.

- [ ] **Step 2: Sync the lock file**

Removing `@rolldown/binding-linux-x64-gnu` from `package.json` means the lock file must be updated — `npm ci` won't do this, it only reads the existing lock. Run:

```bash
npm install
```

Expected: `package-lock.json` is updated (the `@rolldown/binding-linux-x64-gnu` entry is removed from it).

- [ ] **Step 3: Rebuild and verify nothing broke**

```bash
npm run build && npm test
```

Expected: successful build output, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: move build tools to devDependencies"
```

---

## Task 3: Update the `files` field to ship dist/ instead of source

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace the files array**

Find the `"files"` array in `package.json` and replace it with:

```json
"files": [
  "bin",
  "dist",
  "server.js",
  "proxy.js",
  "proxy.d.ts",
  "vault-file-handler.js",
  "vault-file-handler.d.ts",
  "app-data-handler.js",
  "app-data-handler.d.ts"
]
```

Removed entries: `"src"`, `"public"`, `"index.html"`, `"vite.config.ts"`, `"tsconfig.json"`, `"tsconfig.app.json"`, `"tsconfig.node.json"` — source and config files are not needed at runtime.

- [ ] **Step 2: Verify the packed contents**

```bash
npm run build && npm pack --dry-run
```

Expected output should list files under these paths only:
- `package/bin/mcp-explorer.js`
- `package/dist/` (index.html, assets/*)
- `package/server.js`
- `package/proxy.js`, `package/proxy.d.ts`
- `package/vault-file-handler.js`, `package/vault-file-handler.d.ts`
- `package/app-data-handler.js`, `package/app-data-handler.d.ts`
- `package/package.json`, `package/README.md`, `package/CHANGELOG.md`

If you see `src/`, `index.html` at the root, or any tsconfig files in the output — the `files` field was not saved correctly.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: ship dist/ in npm package instead of source files"
```

---

## Task 4: Skip build in CLI when dist/ is already present

The bin script currently always runs `vite build`. When installed from npm, `dist/index.html` exists and the build step must be skipped entirely.

**Files:**
- Modify: `bin/mcp-explorer.js`

- [ ] **Step 1: Add the pre-built dist check and wrap the build block**

In `bin/mcp-explorer.js`, find this block (it appears after the `startSpinner` function definition, before `const stop = startSpinner`):

```js
const stop = startSpinner('building…');
const cleanExit = () => {
  stop();
  process.exit(130);
};
process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);

try {
  await buildSilently();
} catch (err) {
  stop();
  console.error(paint('31;1', '✗ build failed') + paint('2', ` (${err.message})`));
  if (err.output) process.stderr.write(err.output);
  process.exit(1);
}

stop();
```

And the block just before it (the vite binary check):

```js
if (!existsSync(viteBin)) {
  console.error(
    paint('31', `mcp-explorer: could not find vite at ${viteBin}.`) +
      `\nRun "npm install" inside ${pkgRoot} first.`,
  );
  process.exit(1);
}
```

Replace both blocks together with:

```js
const hasPrebuiltDist = existsSync(resolve(pkgRoot, 'dist', 'index.html'));

if (!hasPrebuiltDist) {
  if (!existsSync(viteBin)) {
    console.error(
      paint('31', `mcp-explorer: could not find vite at ${viteBin}.`) +
        `\nRun "npm install" inside ${pkgRoot} first.`,
    );
    process.exit(1);
  }

  const stop = startSpinner('building…');
  const cleanExit = () => {
    stop();
    process.exit(130);
  };
  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);

  try {
    await buildSilently();
  } catch (err) {
    stop();
    console.error(paint('31;1', '✗ build failed') + paint('2', ` (${err.message})`));
    if (err.output) process.stderr.write(err.output);
    process.exit(1);
  }

  stop();
}
```

Everything after this block (the `const args = process.argv.slice(2);` line onward) stays unchanged.

- [ ] **Step 2: Verify the pre-built path skips the build**

```bash
npm run build
node bin/mcp-explorer.js --no-open
```

Expected: no spinner, no "building…" output — the server starts immediately and prints the ready URL. Ctrl+C to stop.

- [ ] **Step 3: Verify the dev fallback still works (optional — needs dist/ removed)**

```bash
mv dist dist_bak
node bin/mcp-explorer.js --no-open
mv dist_bak dist
```

Expected: spinner appears, build runs, server starts.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add bin/mcp-explorer.js
git commit -m "feat: skip vite build when dist/ is already present"
```

---

## Task 5: Add npm publish step to the release workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add job-level permissions and registry-url to the upload-artifact job**

Find the `upload-artifact` job. It currently has no `permissions` key and the `actions/setup-node` step has no `registry-url`. Apply these two changes:

**Add a `permissions` block** directly under the `runs-on` line of the `upload-artifact` job:

```yaml
  permissions:
    contents: write
    id-token: write
```

**Add `registry-url`** to the existing `actions/setup-node` step so it becomes:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          registry-url: 'https://registry.npmjs.org'
```

- [ ] **Step 2: Add the publish step**

After the existing `Upload dist.tgz to release` step, add:

```yaml
      - name: Publish to npm
        run: npm publish
```

No `NODE_AUTH_TOKEN` is needed — npm authenticates via the OIDC token that GitHub generates for the run, verified against the trusted publisher rule configured in the npm account.

The final `upload-artifact` job should look like:

```yaml
  upload-artifact:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      - run: npm run build

      - name: Pack dist as tarball
        run: tar -czf dist.tgz -C dist .

      - name: Upload dist.tgz to release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release upload "${{ needs.release-please.outputs.tag_name }}" dist.tgz --clobber

      - name: Publish to npm
        run: npm publish
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish to npm via OIDC on release"
```

---

## Task 6: One-time npm account setup (manual, outside code)

These steps are done once in your npm account and are not tracked in code.

- [ ] **Step 1: Create npm account**

Go to https://npmjs.com and create an account with username `orenvill` (to match the `@orenvill` scope).

- [ ] **Step 2: Enable 2FA**

In npm account settings → Security → Two-Factor Authentication. 2FA is mandatory since March 2025. Any authenticator app (Google Authenticator, 1Password, etc.) works.

- [ ] **Step 3: Configure OIDC Trusted Publisher**

In npm account settings → Publishing → Trusted Publishers → Add:
- **Repository:** `OrenVill/mcp-explorer`
- **Workflow filename:** `release.yml`
- **Environment:** (leave blank)

This allows the `release.yml` workflow on that repo to publish `@orenvill/mcp-explorer` without any stored token.

- [ ] **Step 4: Verify with a dry-run pack locally**

```bash
npm run build && npm pack --dry-run
```

Confirm the output matches the expected file list from Task 3 Step 2. No actual publish happens here.

---

## Task 7: Update README install instructions

The README currently says to install from GitHub. Update it to reflect the npm package.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the install command**

Find this block in `README.md`:

```bash
npm install -g github:OrenVill/mcp-explorer
```

Replace with:

```bash
npm install -g @orenvill/mcp-explorer
```

- [ ] **Step 2: Update the "not published to npm" note**

Find this paragraph:

```
The package is **not** currently published to the npm registry — the `mcp-explorer` name on npm is held by an unrelated placeholder. To install from source:
```

Replace with:

```
The package is published to the npm registry as `@orenvill/mcp-explorer`. To install from source instead:
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update install instructions for npm release"
```

---

## Task 8: Final smoke test

- [ ] **Step 1: Confirm tests still pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Confirm build and pack are clean**

```bash
npm run build && npm pack --dry-run 2>&1 | grep -v "^npm"
```

Expected: only `bin/`, `dist/`, `server.js`, `proxy.js`, `proxy.d.ts`, `vault-file-handler.*`, `app-data-handler.*`, `package.json`, `README.md`, `CHANGELOG.md` in the output. No `src/`, no tsconfig files, no `vite.config.ts`.

- [ ] **Step 3: Check package name in package.json**

```bash
node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.name, p.license, p.publishConfig)"
```

Expected output:
```
@orenvill/mcp-explorer MIT { access: 'public', provenance: true }
```

- [ ] **Step 4: Create a release PR via conventional commit to trigger the workflow**

Once the npm account setup (Task 6) is complete, merge these changes to `main`. The next `feat:` commit to `main` will trigger release-please to open a Release PR, and merging it will run the full workflow including `npm publish`.

> **Note:** The first publish of a scoped package triggers npm to confirm it is public. `publishConfig.access: "public"` in `package.json` handles this automatically — no manual flags needed.
