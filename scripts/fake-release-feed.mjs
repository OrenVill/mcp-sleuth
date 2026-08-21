#!/usr/bin/env node
/**
 * A pretend GitHub "latest release" endpoint, for seeing the update notifier
 * without publishing a release.
 *
 * The notifier reads MCP_SLEUTH_UPDATE_FEED_URL when it is set, so pointing the
 * app at this server is the whole trick:
 *
 *   node scripts/fake-release-feed.mjs &
 *   MCP_SLEUTH_UPDATE_FEED_URL=http://127.0.0.1:4599/releases/latest npm run electron:start
 *
 * By default it announces one minor version above whatever package.json says, so
 * the running app always sees an update. Flags:
 *
 *   --version 9.9.9   announce this version instead
 *   --same            announce the installed version, to see the "Up to date" state
 *   --port 4599       listen elsewhere
 *   --fail 403        answer with an error, to see how a failed check reads
 *   --building        announce a release whose installers have not uploaded yet
 *
 * Zero dependencies, like every other Node file outside src/ and electron/.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

function flag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

function bumpMinor(version) {
  const [major, minor] = version.split('.').map(Number);
  return `${major}.${(minor || 0) + 1}.0`;
}

const port = Number(flag('port', 4599));
const failStatus = flag('fail') ? Number(flag('fail')) : null;
const version = flag('same') ? pkg.version : String(flag('version', bumpMinor(pkg.version)));

const release = {
  tag_name: `v${version}`,
  name: `v${version}`,
  draft: false,
  prerelease: false,
  html_url: `https://github.com/OrenVill/mcp-sleuth/releases/tag/v${version}`,
  published_at: new Date().toISOString(),
  // Sleuth refuses to announce a release with no installers attached, because
  // release.yml publishes the release ~10 minutes before the matrix uploads
  // them. Pass --building to see that state.
  assets: process.argv.includes('--building')
    ? []
    : [
        { name: `Sleuth-${version}-arm64.dmg`, state: 'uploaded' },
        { name: `Sleuth-${version}-x64.exe`, state: 'uploaded' },
        { name: `Sleuth-${version}-amd64.deb`, state: 'uploaded' },
      ],
  body: [
    '### Features',
    '',
    '* **updates:** tell the user when a new version is out ([#42](https://github.com/OrenVill/mcp-sleuth/pull/42))',
    '* **stdio:** reconnect a subprocess that exits mid-session',
    '',
    '### Bug Fixes',
    '',
    '* **vault:** stop re-prompting after an auto-unlock on Linux',
    '',
    '> This release is served by `scripts/fake-release-feed.mjs`. It is not real.',
  ].join('\n'),
};

createServer((req, res) => {
  if (failStatus) {
    res.writeHead(failStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'API rate limit exceeded for 127.0.0.1' }));
    console.log(`fake-release-feed: ${req.url} -> ${failStatus}`);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(release));
  console.log(`fake-release-feed: ${req.url} -> v${version}`);
}).listen(port, '127.0.0.1', () => {
  console.log(`fake-release-feed: announcing v${version} (installed: v${pkg.version})`);
  console.log(`  MCP_SLEUTH_UPDATE_FEED_URL=http://127.0.0.1:${port}/releases/latest`);
});
