import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_INTERVAL_MS, INITIAL_DELAY_MS, createUpdateService } from './service.js';
import { DEFAULT_UPDATE_STATE } from './store.js';

const RELEASE = {
  version: '1.2.0',
  name: 'v1.2.0',
  notes: '### Features\n* stdio reconnect',
  url: 'https://github.com/OrenVill/mcp-sleuth/releases/tag/v1.2.0',
  publishedAt: '2026-08-21T10:00:00Z',
};

/** An in-memory stand-in for the update-state store. */
function fakeStore(initial = {}) {
  let state = { ...DEFAULT_UPDATE_STATE, ...initial };
  return {
    read: vi.fn(async () => ({ ...state })),
    write: vi.fn(async (next) => {
      state = { ...state, ...next };
      return { ...state };
    }),
    update: vi.fn(async (patch) => {
      state = { ...state, ...patch };
      return { ...state };
    }),
    peek: () => ({ ...state }),
  };
}

/** Captures scheduled callbacks so the test drives time explicitly. */
function fakeTimers() {
  const timeouts = [];
  const intervals = [];
  return {
    timeouts,
    intervals,
    setTimeoutFn: vi.fn((fn, ms) => {
      timeouts.push({ fn, ms });
      return timeouts.length;
    }),
    clearTimeoutFn: vi.fn(),
    setIntervalFn: vi.fn((fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    }),
    clearIntervalFn: vi.fn(),
  };
}

function build({ store = fakeStore(), fetchRelease, currentVersion = '1.0.1', ...rest } = {}) {
  const timers = fakeTimers();
  const logger = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  const service = createUpdateService({
    currentVersion,
    store,
    fetchRelease: fetchRelease ?? vi.fn(async () => RELEASE),
    now: () => 1_755_780_000_000,
    logger,
    ...timers,
    ...rest,
  });
  return { service, store, logger, timers };
}

describe('check — a newer release exists', () => {
  it('reports it as available and shows the banner the first time', async () => {
    const { service } = build();
    const status = await service.check();

    expect(status).toMatchObject({
      currentVersion: '1.0.1',
      latestVersion: '1.2.0',
      updateAvailable: true,
      showBanner: true,
      releaseName: 'v1.2.0',
      releaseUrl: RELEASE.url,
      lastError: null,
    });
  });

  it('records when the check ran', async () => {
    const { service, store } = build();
    await service.check();
    expect(store.peek().lastCheckedAt).toBe(1_755_780_000_000);
  });

  it('notifies subscribers', async () => {
    const { service } = build();
    const handler = vi.fn();
    service.onAvailable(handler);

    await service.check();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ latestVersion: '1.2.0' });
  });

  it('stops notifying after unsubscribe', async () => {
    const { service } = build();
    const handler = vi.fn();
    service.onAvailable(handler)();
    await service.check();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('check — nothing newer', () => {
  it('reports up to date when the release matches the running version', async () => {
    const { service } = build({ currentVersion: '1.2.0' });
    await expect(service.check()).resolves.toMatchObject({
      updateAvailable: false,
      showBanner: false,
      latestVersion: '1.2.0',
    });
  });

  it('reports up to date when the running version is ahead, as in a dev build', async () => {
    const { service } = build({ currentVersion: '2.0.0' });
    await expect(service.check()).resolves.toMatchObject({ updateAvailable: false });
  });

  it('does not notify subscribers', async () => {
    const { service } = build({ currentVersion: '1.2.0' });
    const handler = vi.fn();
    service.onAvailable(handler);
    await service.check();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('skip and dismiss', () => {
  it('skip hides the banner and the badge', async () => {
    const { service } = build();
    await service.check();
    const status = await service.skip('1.2.0');

    expect(status).toMatchObject({ updateAvailable: false, showBanner: false });
  });

  it('skip is forgotten once something newer than the skipped version ships', async () => {
    const fetchRelease = vi.fn(async () => ({ ...RELEASE, version: '1.3.0' }));
    const { service } = build({ store: fakeStore({ skippedVersion: '1.2.0' }), fetchRelease });

    await expect(service.check()).resolves.toMatchObject({
      updateAvailable: true,
      showBanner: true,
      latestVersion: '1.3.0',
    });
  });

  it('dismiss keeps the badge but drops the banner', async () => {
    const { service } = build();
    await service.check();
    const status = await service.dismiss('1.2.0');

    expect(status).toMatchObject({ updateAvailable: true, showBanner: false });
  });

  it('a dismissal survives a restart', async () => {
    const { service } = build({ store: fakeStore({ dismissedVersion: '1.2.0' }) });
    await expect(service.check()).resolves.toMatchObject({
      updateAvailable: true,
      showBanner: false,
    });
  });

  it('a newer version brings the banner back after a dismissal', async () => {
    const fetchRelease = vi.fn(async () => ({ ...RELEASE, version: '1.4.0' }));
    const { service } = build({ store: fakeStore({ dismissedVersion: '1.2.0' }), fetchRelease });
    await expect(service.check()).resolves.toMatchObject({ showBanner: true });
  });

  it('ignores a skip or dismiss for a version that is not a version', async () => {
    const { service, store } = build();
    await service.skip('nightly');
    expect(store.peek().skippedVersion).toBeNull();
  });
});

describe('check — failure', () => {
  it('surfaces the error on a manual check', async () => {
    const fetchRelease = vi.fn().mockRejectedValue(new Error('GitHub rate limit reached'));
    const { service } = build({ fetchRelease });

    await expect(service.check({ manual: true })).resolves.toMatchObject({
      lastError: 'GitHub rate limit reached',
      updateAvailable: false,
    });
  });

  it('stays silent on an automatic check, but logs it', async () => {
    const fetchRelease = vi.fn().mockRejectedValue(new Error('offline'));
    const { service, logger } = build({ fetchRelease });

    const status = await service.check();
    expect(status.lastError).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the last known good result when a later check fails', async () => {
    const fetchRelease = vi
      .fn()
      .mockResolvedValueOnce(RELEASE)
      .mockRejectedValueOnce(new Error('offline'));
    const { service } = build({ fetchRelease });

    await service.check();
    await expect(service.check({ manual: true })).resolves.toMatchObject({
      latestVersion: '1.2.0',
      updateAvailable: true,
      lastError: 'offline',
    });
  });

  it('clears a stale error on the next success', async () => {
    const fetchRelease = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(RELEASE);
    const { service } = build({ fetchRelease });

    await service.check({ manual: true });
    await expect(service.check({ manual: true })).resolves.toMatchObject({ lastError: null });
  });
});

describe('autoCheck', () => {
  it('schedules the first check after the startup delay, then the interval', async () => {
    const { service, timers } = build();
    await service.start();

    expect(timers.timeouts[0].ms).toBe(INITIAL_DELAY_MS);
    expect(timers.intervals[0].ms).toBe(CHECK_INTERVAL_MS);
  });

  it('actually checks when the startup timer fires', async () => {
    const fetchRelease = vi.fn(async () => RELEASE);
    const { service, timers } = build({ fetchRelease });
    await service.start();

    await timers.timeouts[0].fn();

    expect(fetchRelease).toHaveBeenCalledTimes(1);
  });

  it('schedules nothing when the user turned checking off', async () => {
    const { service, timers } = build({ store: fakeStore({ autoCheck: false }) });
    await service.start();

    expect(timers.timeouts).toHaveLength(0);
    expect(timers.intervals).toHaveLength(0);
  });

  it('starts checking when the user turns it back on', async () => {
    const { service, timers } = build({ store: fakeStore({ autoCheck: false }) });
    await service.start();
    await service.setAutoCheck(true);

    expect(timers.intervals).toHaveLength(1);
  });

  it('stops checking when the user turns it off', async () => {
    const { service, timers } = build();
    await service.start();
    const status = await service.setAutoCheck(false);

    expect(timers.clearIntervalFn).toHaveBeenCalled();
    expect(timers.clearTimeoutFn).toHaveBeenCalled();
    expect(status.autoCheck).toBe(false);
  });

  it('persists the preference', async () => {
    const { service, store } = build();
    await service.setAutoCheck(false);
    expect(store.peek().autoCheck).toBe(false);
  });

  it('a manual check still works with auto-checking off', async () => {
    const fetchRelease = vi.fn(async () => RELEASE);
    const { service } = build({ store: fakeStore({ autoCheck: false }), fetchRelease });

    await expect(service.check({ manual: true })).resolves.toMatchObject({
      updateAvailable: true,
    });
    expect(fetchRelease).toHaveBeenCalledTimes(1);
  });

  it('start is idempotent — a second call does not double the timers', async () => {
    const { service, timers } = build();
    await service.start();
    await service.start();

    expect(timers.intervals).toHaveLength(1);
  });

  it('stop clears everything', async () => {
    const { service, timers } = build();
    await service.start();
    service.stop();

    expect(timers.clearIntervalFn).toHaveBeenCalled();
  });
});

describe('getStatus', () => {
  let service;

  beforeEach(() => {
    ({ service } = build());
  });

  it('reports the running version before any check has happened', async () => {
    await expect(service.getStatus()).resolves.toMatchObject({
      currentVersion: '1.0.1',
      latestVersion: null,
      updateAvailable: false,
      autoCheck: true,
      lastCheckedAt: null,
    });
  });

  it('reflects the last check afterwards', async () => {
    await service.check();
    await expect(service.getStatus()).resolves.toMatchObject({ latestVersion: '1.2.0' });
  });
});

describe('getReleaseUrl', () => {
  it('is null until a release has been seen', () => {
    const { service } = build();
    expect(service.getReleaseUrl()).toBeNull();
  });

  it('is the release page once one has', async () => {
    const { service } = build();
    await service.check();
    expect(service.getReleaseUrl()).toBe(RELEASE.url);
  });
});
