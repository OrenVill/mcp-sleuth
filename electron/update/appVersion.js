/**
 * The version the app should call itself.
 *
 * `app.getVersion()` is not enough on its own. Electron reads it from the app's
 * package.json only when that file has a `main` field, and this project's
 * package.json deliberately has none — it is published as a CLI, and a `main`
 * pointing at electron/main.js would make `require('@orenvill/mcp-sleuth')` boot
 * a window. electron-builder injects `main` into the *packaged* copy via
 * `extraMetadata`, so a packaged app answers correctly while `electron
 * electron/main.js` answers with Electron's own version (43.4.1), which would
 * announce an "update" from 43.4.1 to 1.2.0 in dev and in the e2e suite.
 *
 * So: read our own package.json, and keep `app.getVersion()` as the fallback.
 * Both paths agree inside the asar, where package.json is on the files allowlist.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVersion } from './version.js';

export function getPackageJsonPath() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
}

/**
 * `fallback` is `app.getVersion()`. Returns null only when neither source yields
 * something that parses as a version — in which case nothing is ever announced,
 * because comparing against a null current version is refused upstream.
 */
export function resolveCurrentVersion({
  fallback = null,
  packagePath = getPackageJsonPath(),
  readFile = readFileSync,
} = {}) {
  try {
    const { version } = JSON.parse(readFile(packagePath, 'utf8'));
    if (parseVersion(version)) return version;
  } catch {
    /* packaged without it, or unreadable: fall back */
  }
  return parseVersion(fallback) ? fallback : null;
}
