import { useEffect, useRef, useState } from 'react';
import type { UpdateController } from './useUpdateStatus';

function formatChecked(at: number | null): string {
  if (!at) return 'not checked yet';
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return 'checked just now';
  if (minutes < 60) return `checked ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `checked ${hours}h ago`;
  return `checked ${Math.round(hours / 24)}d ago`;
}

/**
 * The permanent update affordance: the running version, and the controls behind
 * it.
 *
 * It lives in the header rather than the application menu because
 * `autoHideMenuBar` hides that menu on Windows and Linux, where most users would
 * then never find the off switch.
 *
 * Renders nothing when there is no update channel, which is what keeps it out of
 * the browser build.
 */
export function VersionPill({ update }: { update: UpdateController }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { status } = update;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!status) return null;

  const available = status.updateAvailable && status.latestVersion !== null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid="version-pill"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={available ? `Sleuth ${status.latestVersion} is available` : 'Version'}
        className={`text-xs px-2 py-0.5 rounded-full border transition-colors font-mono ${
          available
            ? 'bg-violet-950/60 border-violet-700/70 text-violet-200 hover:border-violet-500'
            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
        }`}
      >
        {available ? `↑${status.latestVersion}` : `v${status.currentVersion}`}
      </button>

      {open && (
        <div
          data-testid="version-popover"
          className="absolute left-0 top-full mt-2 z-50 w-64 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/40 p-3 text-xs"
        >
          <div className="text-zinc-200 font-medium">Sleuth {status.currentVersion}</div>

          <div className="mt-1 text-zinc-500">
            {available ? (
              <span className="text-violet-300">Version {status.latestVersion} is available</span>
            ) : (
              <span>Up to date</span>
            )}
            <span className="text-zinc-600"> · {formatChecked(status.lastCheckedAt)}</span>
          </div>

          {status.lastError && (
            <div className="mt-2 rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1 text-red-300">
              {status.lastError}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={update.check}
              disabled={update.checking}
              className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-50 transition-colors"
            >
              {update.checking ? 'Checking…' : 'Check now'}
            </button>
            {available && (
              <button
                type="button"
                onClick={() => {
                  update.openRelease();
                  setOpen(false);
                }}
                className="px-2 py-1 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
              >
                Download
              </button>
            )}
          </div>

          <label className="mt-3 flex items-start gap-2 text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={status.autoCheck}
              onChange={(event) => update.setAutoCheck(event.target.checked)}
              className="mt-0.5 accent-violet-600"
            />
            <span>
              Check for updates automatically
              <span className="block text-zinc-600">
                One request to github.com, every 6 hours. Nothing else is sent.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
