# npm Publishing Design: @orenvill/mcp-explorer

**Date:** 2026-05-23
**Status:** Approved

## Goal

Publish `mcp-explorer` to the public npm registry as `@orenvill/mcp-explorer` so users can install it with `npm install -g @orenvill/mcp-explorer` and run `mcp-explorer` directly without cloning the repo.

## Package identity

- **Name:** `@orenvill/mcp-explorer` (scoped — the unscoped `mcp-explorer` is held by an unrelated placeholder)
- **Registry:** https://registry.npmjs.org
- **Scope owner:** npm user `orenvill`

### package.json additions

| Field | Value |
|---|---|
| `name` | `@orenvill/mcp-explorer` |
| `license` | `"MIT"` |
| `repository` | `{ "type": "git", "url": "https://github.com/OrenVill/mcp-explorer" }` |
| `homepage` | `"https://github.com/OrenVill/mcp-explorer"` |
| `keywords` | `["mcp", "model-context-protocol", "developer-tools", "cli"]` |
| `publishConfig` | `{ "access": "public", "provenance": true }` |

`publishConfig.access: "public"` ensures the scoped package is always published publicly without requiring `--access public` flags. `publishConfig.provenance: true` enables npm provenance attestations declaratively.

## Distribution: pre-built

The CLI currently runs `vite build` on first invocation, requiring vite to be present in `node_modules`. For npm installs, we ship a pre-built `dist/` and skip the build step entirely.

### Dependency changes

Move from `dependencies` → `devDependencies`:
- `vite`, `@tailwindcss/vite`, `@vitejs/plugin-react`
- `react`, `react-dom`, `shiki`, `tailwindcss`
- `@rolldown/binding-linux-x64-gnu`

Keep in `dependencies`:
- `@modelcontextprotocol/sdk` — used by `proxy.js` at runtime

This reduces the installed footprint from ~50MB to only the MCP SDK.

### `files` field

Replace current source-file list with:

```json
"files": [
  "bin",
  "dist",
  "server.js",
  "proxy.js", "proxy.d.ts",
  "vault-file-handler.js", "vault-file-handler.d.ts",
  "app-data-handler.js", "app-data-handler.d.ts"
]
```

Removed: `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — not needed at runtime.

## CLI bin script change

`bin/mcp-explorer.js` always runs `vite build`. With a pre-built `dist/`, it should detect and skip the build:

```js
const hasPrebuiltDist = existsSync(resolve(pkgRoot, 'dist', 'index.html'));

if (!hasPrebuiltDist) {
  // fallback: build from source (dev / npm link installs)
  await buildSilently();
}
// always: start server + open browser
```

- npm-installed users get instant startup (no spinner, no build wait)
- Dev workflow (`npm run dev`, `npm link`) is unchanged — the fallback triggers when `dist/` is absent

## GitHub Actions: release workflow

Changes to `.github/workflows/release.yml`, `upload-artifact` job:

### Permissions

Add `id-token: write` (required for OIDC token generation):

```yaml
permissions:
  contents: write
  id-token: write
```

### Steps

Add `registry-url` to the existing `actions/setup-node` step:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm
    registry-url: 'https://registry.npmjs.org'
```

Add publish step after the existing artifact upload:

```yaml
- name: Publish to npm
  run: npm publish
```

No `NPM_TOKEN` secret is needed. npm authenticates via a short-lived OIDC token that GitHub generates for the workflow run, verified against the trusted publisher rule configured in the npm account.

## Publishing method: OIDC Trusted Publishing

OIDC is preferred over an npm automation token because:
- No secret to create, store, or rotate (granular tokens expire every 90 days)
- Provenance attestations are generated automatically (`publishConfig.provenance: true`)
- Publish permission is scoped to a specific repo + workflow — not a global credential

## One-time manual prerequisites

These are done once in account settings, not in code:

1. **npm account** — create at npmjs.com with username `orenvill`; enable 2FA (mandatory since March 2025)
2. **OIDC Trusted Publisher rule** — in npm account → Publishing → Trusted Publishers:
   - Repository: `OrenVill/mcp-explorer`
   - Workflow filename: `release.yml`
   - Environment: (leave blank)
3. **First publish** — `publishConfig.access: "public"` handles the scoped-package visibility requirement automatically

## Verification

Use `npm pack --dry-run` locally (after build) to confirm the package contents match the `files` field before the first real publish.

## Summary of changes

| Area | Change |
|---|---|
| `package.json` | Rename to `@orenvill/mcp-explorer`; add `license`, `repository`, `homepage`, `keywords`, `publishConfig` |
| `package.json` deps | Move build tools to `devDependencies`; remove platform-specific binding |
| `package.json` files | Ship `dist/` instead of source files |
| `bin/mcp-explorer.js` | Skip build when `dist/index.html` already exists |
| `release.yml` | Add `id-token: write`; add `registry-url` to setup-node; add `npm publish` step |
| npm account | 2FA + OIDC trusted publisher rule (one-time manual) |
