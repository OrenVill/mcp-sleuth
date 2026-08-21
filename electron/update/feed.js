/**
 * The update feed: GitHub's "latest release" endpoint.
 *
 * `/releases/latest` excludes drafts and prereleases, which is what makes it the
 * right endpoint here — a version is announced only once its GitHub Release
 * exists, and in .github/workflows/release.yml that is the same release the
 * installers upload to moments later.
 *
 * `fetch` is injected so the tests never touch the network. In the app it is
 * Electron's `net.fetch`, which uses Chromium's network stack and therefore the
 * system proxy configuration.
 */
import { parseVersion } from './version.js';

export const DEFAULT_FEED_URL =
  'https://api.github.com/repos/OrenVill/mcp-sleuth/releases/latest';

/** The notes render inside a banner, not a document viewer. */
export const MAX_NOTES_LENGTH = 2000;

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The installer extensions electron-builder produces, per electron-builder.yml.
 * `dist.tgz` and GitHub's own source archives are deliberately not here: they
 * are not something a desktop user can install.
 */
const INSTALLER_RE = /\.(dmg|exe|AppImage|deb|zip)$/i;

/**
 * True once at least one installer is actually attached to the release.
 *
 * This closes a real window. In .github/workflows/release.yml, release-please
 * publishes the GitHub Release first — making it `/releases/latest` at once —
 * and only then does a three-OS matrix spend about ten minutes building the
 * installers and uploading them. Announcing during that gap would send the user
 * to a release page with nothing on it to download.
 *
 * Any one installer is enough rather than one for the current platform: the
 * matrix runs `fail-fast: false` precisely so one platform failing still ships
 * the others, and matching asset names to a platform is the brittleness this
 * feature already refused once for the Download link.
 */
export function hasInstallerAsset(payload) {
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  return assets.some(
    (asset) =>
      typeof asset?.name === 'string' &&
      INSTALLER_RE.test(asset.name) &&
      // GitHub reports 'uploaded' once the upload finished; older payloads omit it.
      (asset.state === undefined || asset.state === 'uploaded'),
  );
}

/**
 * The feed URL, overridable for the e2e fixture, the manual demo, and forks.
 */
export function resolveFeedUrl(env = process.env) {
  const override = env.MCP_SLEUTH_UPDATE_FEED_URL;
  if (typeof override === 'string' && override.trim() !== '') return override.trim();
  return DEFAULT_FEED_URL;
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Narrow a GitHub release payload to what the notifier shows. Returns null when
 * the payload is not a release this app should announce.
 */
export function parseRelease(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.draft === true || payload.prerelease === true) return null;

  const tag = typeof payload.tag_name === 'string' ? payload.tag_name.trim() : '';
  const parsed = parseVersion(tag);
  if (!parsed) return null;

  // The url is handed to the OS by openRelease; anything but http(s) is refused
  // here as well as in externalLinks.js.
  if (!isHttpUrl(payload.html_url)) return null;

  // Nothing to send the user to yet — see hasInstallerAsset.
  if (!hasInstallerAsset(payload)) return null;

  const body = typeof payload.body === 'string' ? payload.body : '';
  const notes =
    body.length > MAX_NOTES_LENGTH ? `${body.slice(0, MAX_NOTES_LENGTH)}…` : body;

  return {
    version: `${parsed.major}.${parsed.minor}.${parsed.patch}${
      parsed.prerelease ? `-${parsed.prerelease}` : ''
    }`,
    name: typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name : tag,
    notes,
    url: payload.html_url,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : null,
  };
}

function describeHttpFailure(status, body) {
  if (status === 403 || status === 429) {
    const message = typeof body?.message === 'string' ? body.message : '';
    if (/rate limit/i.test(message) || status === 429) {
      return 'GitHub rate limit reached — try again later';
    }
    return 'GitHub refused the request';
  }
  if (status === 404) return 'No releases published yet';
  return `GitHub returned ${status}`;
}

/**
 * Fetch and parse the latest release. Throws with a message fit to show a user —
 * a manual check surfaces it in the popover.
 */
export async function fetchLatestRelease({
  fetch: fetchFn,
  url = DEFAULT_FEED_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (typeof fetchFn !== 'function') throw new Error('No fetch implementation');

  const controller = new AbortController();
  const timer = setTimeoutFn(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      // No credentials, no Authorization header: this request carries nothing
      // that identifies the user beyond the IP any HTTP request exposes.
      credentials: 'omit',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'mcp-sleuth-update-check',
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('The update check timed out', { cause: err });
    }
    throw err;
  } finally {
    clearTimeoutFn(timer);
  }

  if (!response?.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      /* a failure body is a nicety, not a requirement */
    }
    throw new Error(describeHttpFailure(response?.status ?? 0, body));
  }

  const payload = await response.json();
  const release = parseRelease(payload);
  if (!release) {
    // Distinguish "the release exists but its installers are still uploading"
    // from "this is not a release at all": only the first is worth waiting out,
    // and a manual check shows this message verbatim.
    if (parseVersion(payload?.tag_name) && !hasInstallerAsset(payload)) {
      throw new Error(`Release ${payload.tag_name} is still being built — try again shortly`);
    }
    throw new Error('The feed returned no usable release');
  }
  return release;
}
