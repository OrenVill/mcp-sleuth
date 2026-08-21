import { useCallback, useEffect, useState } from 'react';
import { getHost } from '../lib/host';
import type { UpdateStatus } from '../lib/host';

export interface UpdateController {
  /** null until the first read resolves, and forever in the browser build. */
  status: UpdateStatus | null;
  checking: boolean;
  check: () => void;
  setAutoCheck: (enabled: boolean) => void;
  skip: () => void;
  dismiss: () => void;
  openRelease: () => void;
}

/**
 * The renderer's whole view of updates.
 *
 * Every action resolves to the full status, so this holds no rules of its own —
 * whether a banner or only a badge is warranted was decided in the main process.
 * In the browser build every call resolves null and nothing renders.
 */
export function useUpdateStatus(): UpdateController {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    const host = getHost();

    void host.updates
      .getStatus()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        /* an unreachable update channel must not break the app chrome */
      });

    const unsubscribe = host.updates.onUpdateAvailable((next) => {
      if (active) setStatus(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const run = useCallback((action: Promise<UpdateStatus | null>) => {
    void action
      .then((next) => {
        if (next) setStatus(next);
      })
      .catch(() => {
        /* the pill keeps its last known state rather than blanking */
      });
  }, []);

  const check = useCallback(() => {
    setChecking(true);
    void getHost()
      .updates.check()
      .then((next) => {
        if (next) setStatus(next);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  // Hoisted so the callbacks below depend on the version string itself rather
  // than on the whole status object.
  const latestVersion = status?.latestVersion ?? null;

  return {
    status,
    checking,
    check,
    setAutoCheck: useCallback(
      (enabled: boolean) => run(getHost().updates.setAutoCheck(enabled)),
      [run],
    ),
    skip: useCallback(() => {
      if (latestVersion) run(getHost().updates.skip(latestVersion));
    }, [run, latestVersion]),
    dismiss: useCallback(() => {
      if (latestVersion) run(getHost().updates.dismiss(latestVersion));
    }, [run, latestVersion]),
    openRelease: useCallback(() => {
      void getHost().updates.openRelease();
    }, []),
  };
}
