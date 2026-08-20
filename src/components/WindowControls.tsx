import { useEffect, useState } from 'react';
import { hasCustomWindowControls, windowControls } from '../lib/windowControls';

const BUTTON =
  'grid h-8 w-11 place-items-center text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100';

/**
 * Window controls for the frameless desktop window.
 *
 * Renders nothing in the browser build and on macOS, which keeps its native
 * traffic lights.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const enabled = hasCustomWindowControls();

  useEffect(() => {
    if (!enabled) return;
    void windowControls.isMaximized().then((value) => setMaximized(Boolean(value)));
    return windowControls.onMaximizedChanged(setMaximized);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="window-controls -mr-3 ml-2 flex items-center self-stretch">
      <button type="button" className={BUTTON} onClick={windowControls.minimize} aria-label="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>

      <button
        type="button"
        className={BUTTON}
        onClick={windowControls.toggleMaximize}
        aria-label={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" fill="none" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className={`${BUTTON} hover:bg-red-600 hover:text-white`}
        onClick={windowControls.close}
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" fill="none" />
        </svg>
      </button>
    </div>
  );
}
