/**
 * The update notifier's policy.
 *
 * Everything the renderer is allowed to know about updates is decided here: when
 * to check, whether a release is worth mentioning, and whether it earns a banner
 * or only the quiet badge. Keeping that here rather than in the UI means the
 * banner component holds no rules, and the rules are testable without a window.
 *
 * The clock and the timers are injected so the six-hour cadence can be tested in
 * milliseconds.
 *
 * This service never downloads or installs anything: the builds are unsigned, so
 * "update" means "here is the release page". See the design doc for why.
 */
import { isNewerVersion, parseVersion } from './version.js';

/** Late enough that the check never competes with startup. */
export const INITIAL_DELAY_MS = 5_000;

/** Long-running sessions are the reason this exists at all. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function createUpdateService({
  currentVersion,
  store,
  fetchRelease,
  now = () => Date.now(),
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  /** The last release the feed returned, kept so a later failure does not erase it. */
  let release = null;
  let lastError = null;
  let startTimer = null;
  let intervalTimer = null;
  let started = false;
  const listeners = new Set();

  /**
   * A version the user has answered for silences everything up to and including
   * itself: `latest <= answered` means "already dealt with". Anything newer is a
   * new question, so it speaks again.
   */
  function answeredFor(answered, latest) {
    return typeof answered === 'string' && !isNewerVersion(latest, answered);
  }

  function buildStatus(state) {
    const latestVersion = release?.version ?? null;
    const newer = latestVersion !== null && isNewerVersion(latestVersion, currentVersion);
    const skipped = newer && answeredFor(state.skippedVersion, latestVersion);
    const dismissed = newer && answeredFor(state.dismissedVersion, latestVersion);
    const updateAvailable = newer && !skipped;

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      showBanner: updateAvailable && !dismissed,
      releaseName: release?.name ?? null,
      releaseNotes: release?.notes ?? null,
      releaseUrl: release?.url ?? null,
      autoCheck: state.autoCheck,
      lastCheckedAt: state.lastCheckedAt,
      lastError,
    };
  }

  async function status() {
    return buildStatus(await store.read());
  }

  function emit(next) {
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (err) {
        logger.warn?.('sleuth: update listener failed', err);
      }
    }
  }

  function stopTimers() {
    if (startTimer !== null) {
      clearTimeoutFn(startTimer);
      startTimer = null;
    }
    if (intervalTimer !== null) {
      clearIntervalFn(intervalTimer);
      intervalTimer = null;
    }
  }

  function startTimers() {
    if (startTimer !== null || intervalTimer !== null) return;
    startTimer = setTimeoutFn(() => {
      startTimer = null;
      void check();
    }, INITIAL_DELAY_MS);
    intervalTimer = setIntervalFn(() => void check(), CHECK_INTERVAL_MS);
  }

  /**
   * `manual` changes only how failure is reported: a check the user asked for
   * owes them an answer, a background one must not nag.
   */
  async function check({ manual = false } = {}) {
    try {
      release = await fetchRelease();
      lastError = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = manual ? message : null;
      logger.warn?.(`sleuth: update check failed — ${message}`);
      return buildStatus(await store.update({ lastCheckedAt: now() }));
    }

    const next = buildStatus(await store.update({ lastCheckedAt: now() }));
    if (next.updateAvailable) emit(next);
    return next;
  }

  return {
    getStatus: status,
    check,

    /** Begin the schedule, unless the user has switched checking off. */
    async start() {
      if (started) return status();
      started = true;
      const state = await store.read();
      if (state.autoCheck) startTimers();
      return buildStatus(state);
    },

    stop() {
      started = false;
      stopTimers();
    },

    async setAutoCheck(enabled) {
      const state = await store.update({ autoCheck: enabled === true });
      if (state.autoCheck) startTimers();
      else stopTimers();
      return buildStatus(state);
    },

    async skip(version) {
      if (!parseVersion(version)) return status();
      return buildStatus(await store.update({ skippedVersion: version }));
    },

    async dismiss(version) {
      if (!parseVersion(version)) return status();
      return buildStatus(await store.update({ dismissedVersion: version }));
    },

    /** The page `openRelease` hands to the OS. Null until a release is known. */
    getReleaseUrl() {
      return release?.url ?? null;
    },

    onAvailable(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
