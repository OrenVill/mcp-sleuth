/**
 * Update preferences: whether to check, and which versions the user has already
 * answered for.
 *
 * A sibling of window-state.json in the shared data directory, so
 * MCP_SLEUTH_DATA_DIR keeps working and no new directory is invented. Not the
 * vault — there is no secret here — and not data.gz, which is renderer-owned and
 * unreachable until the vault is unlocked. The check runs before that.
 *
 * File access is injected, matching secrets/store.js and appdata/store.js.
 */
import { dirname, join } from 'node:path';
import { getAppDataFilePath } from '../../app-data-handler.js';
import { parseVersion } from './version.js';

export const DEFAULT_UPDATE_STATE = Object.freeze({
  /** Checking is on by default; the pill's checkbox turns it off. */
  autoCheck: true,
  /** Silences the banner *and* the badge until something newer ships. */
  skippedVersion: null,
  /** Silences the banner only; the badge stays as the reminder. */
  dismissedVersion: null,
  lastCheckedAt: null,
});

function versionOrNull(value) {
  return typeof value === 'string' && parseVersion(value) ? value : null;
}

/** Coerce anything read off disk into a state object with no surprises in it. */
export function normaliseState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_UPDATE_STATE };
  return {
    // Only an explicit false disables checking: a corrupt field must not silently
    // switch updates off.
    autoCheck: raw.autoCheck !== false,
    skippedVersion: versionOrNull(raw.skippedVersion),
    dismissedVersion: versionOrNull(raw.dismissedVersion),
    lastCheckedAt: Number.isFinite(raw.lastCheckedAt) ? raw.lastCheckedAt : null,
  };
}

export function getUpdateStateFilePath() {
  return join(dirname(getAppDataFilePath()), 'update-state.json');
}

export function createUpdateStateStore({ fs, filePath }) {
  return {
    filePath,

    async read() {
      try {
        return normaliseState(JSON.parse(await fs.readFile(filePath, 'utf8')));
      } catch {
        return { ...DEFAULT_UPDATE_STATE };
      }
    },

    async write(state) {
      const next = normaliseState(state);
      try {
        await fs.mkdir(dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(next), 'utf8');
      } catch {
        /* a preference is not worth failing the app over */
      }
      return next;
    },

    async update(patch) {
      return this.write({ ...(await this.read()), ...patch });
    },
  };
}
