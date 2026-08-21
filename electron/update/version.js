/**
 * Semantic version comparison, enough of it for release tags.
 *
 * Pure and dependency-free — the project takes no npm dependency it can write in
 * thirty lines, and the main process has none at all besides the MCP SDK.
 *
 * Scope: `major.minor.patch` with an optional `-prerelease` tail and optional
 * build metadata, with or without a leading `v` (GitHub tags carry one, and
 * `app.getVersion()` does not).
 */

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Returns the parsed parts, or null when the input is not a version at all. */
export function parseVersion(input) {
  if (typeof input !== 'string') return null;
  const match = VERSION_RE.exec(input.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/**
 * Compare two dot-separated prerelease tails, semver-style: numeric identifiers
 * compare numerically, everything else lexically, and a shorter tail loses when
 * it is a prefix of the longer one (`rc.1` < `rc.1.1`).
 */
function comparePrerelease(a, b) {
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNum = /^\d+$/.test(l);
    const rNum = /^\d+$/.test(r);
    if (lNum && rNum) {
      if (Number(l) !== Number(r)) return Number(l) > Number(r) ? 1 : -1;
      continue;
    }
    if (lNum !== rNum) return lNum ? -1 : 1;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

/**
 * -1, 0, or 1.
 *
 * An unparseable version on either side yields 0. That is the safe direction: an
 * unrecognised tag is never announced as an update, rather than being announced
 * wrongly.
 */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) return left[part] > right[part] ? 1 : -1;
  }

  if (left.prerelease === right.prerelease) return 0;
  // A release outranks any prerelease of the same version.
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** True when `candidate` is strictly ahead of `current`. */
export function isNewerVersion(candidate, current) {
  if (!parseVersion(candidate) || !parseVersion(current)) return false;
  return compareVersions(candidate, current) > 0;
}
